import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * Admin Partners (owner, 2026-11-13): Services and Shops directories and a full
 * profile per business. A business that signed up as both appears on both
 * sides, each linking to the other. Read-only; bank details never appear.
 */
describe("admin partners directory and profiles", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole, serviceScopes: AdminVertical[] = []): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `apdir-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE, serviceScopes } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("lists services and shops, links the two halves of one business, and shows the full profile of each", async () => {
    const tag = randomUUID().slice(0, 8);
    const ops = await actor("Partner Ops", AdminRole.ADMIN);
    const owner = await actor("Owner Sara");
    const customer = await actor("Customer");

    const shop = await db.sellerOrganization.create({
      data: {
        name: `Paws Shop ${tag}`, countryCode: "IR", status: "PENDING", verificationStatus: "SUBMITTED", city: "Tehran", province: "Tehran", addressLine: "Valiasr 10", postalCode: "1234567890",
        supportContactPhone: "02100000000", openingHours: [{ dayOfWeek: 6, open: "10:00", close: "20:00" }, { dayOfWeek: 9, open: "x", close: "y" }],
        memberships: { create: { userId: owner.id, role: "OWNER", status: "ACTIVE" } },
      },
    });
    const org = await db.providerOrganization.create({
      data: { name: `Paws Grooming ${tag}`, type: "GROOMER", serviceKinds: ["GROOMER", "BOARDING"], verificationStatus: "UNDER_REVIEW", phone: "02100000001", linkedSellerOrganizationId: shop.id },
    });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Valiasr 10", city: "Tehran", region: "Tehran", countryCode: "IR", timezone: "Asia/Tehran", latitude: 35.7, longitude: 51.4 } });
    const owned = await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: "OWNER" } });
    const groom = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Full groom", type: "GROOMING_SESSION", category: "GROOMING", locationMode: "AT_PROVIDER", durationMinutes: 90, priceAmount: 1_500_000, currency: "IRR", isActive: false } });
    await db.providerServiceVariant.create({ data: { serviceId: groom.id, name: "Large dog", priceAmount: 2_000_000, durationMinutes: 120 } });
    await db.providerAvailabilityRule.create({ data: { providerOrganizationId: org.id, locationId: location.id, providerUserId: owned.id, dayOfWeek: 6, startLocalTime: "09:00", endLocalTime: "17:00", timezone: "Asia/Tehran" } });
    await db.partnerVerificationProfile.create({ data: { subjectType: "PROVIDER", subjectId: org.id, firstName: "Sara", lastName: "Ahmadi", mobile: "09120000000", landline: "02100000001", mobileVerifiedAt: new Date(), updatedByUserId: owner.id } });
    await db.partnerVerificationDocument.create({ data: { subjectType: "PROVIDER", subjectId: org.id, kind: "NATIONAL_ID_CARD", objectKey: `partner-verification/${org.id}/${randomUUID()}.jpg`, mimeType: "image/jpeg", fileSizeBytes: 1000, uploadedByUserId: owner.id } });

    const category = await db.productCategory.create({ data: { name: `Food ${tag}`, slug: `food-${tag}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `Cat food ${tag}`, slug: `cat-food-${tag}`, allergenTags: [], status: "ACTIVE" } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `cf-${tag}`, title: "2 kg" } });
    await db.sellerOffer.create({ data: { sellerOrganizationId: shop.id, productVariantId: variant.id, priceAmount: 2_000_000, status: "PAUSED", moderationStatus: "PENDING_REVIEW", inventoryItem: { create: { onHand: 12, reserved: 2 } } } });

    await get(customer, "/admin/partners/services").expect(403);

    // Services: found by city, filtered by kind, naming the shop it also runs.
    const services = (await get(ops, `/admin/partners/services?q=${encodeURIComponent(`Paws Grooming ${tag}`)}&kind=BOARDING`).expect(200)).body;
    expect(services.items).toHaveLength(1);
    expect(services.items[0]).toMatchObject({ id: org.id, serviceKinds: ["GROOMER", "BOARDING"], city: "Tehran", province: "Tehran", verificationStatus: "UNDER_REVIEW", activeServices: 0, inactiveServices: 1, pendingDocuments: 1, linkedShop: { id: shop.id, name: shop.name } });
    expect((await get(ops, `/admin/partners/services?q=${encodeURIComponent(`Paws Grooming ${tag}`)}&kind=PET_TAXI`).expect(200)).body.items).toEqual([]);
    expect((await get(ops, `/admin/partners/services?q=${encodeURIComponent(`Paws Grooming ${tag}`)}&verification=VERIFIED`).expect(200)).body.items).toEqual([]);
    await get(ops, "/admin/partners/services?kind=DRAGON").expect(400);

    // Shops: the same business, from the other side.
    const shops = (await get(ops, `/admin/partners/shops?q=${encodeURIComponent(`Paws Shop ${tag}`)}`).expect(200)).body;
    expect(shops.items[0]).toMatchObject({ id: shop.id, status: "PENDING", activeOffers: 0, pendingOffers: 1, linkedService: { id: org.id, type: "GROOMER" } });

    const profile = (await get(ops, `/admin/partners/services/${org.id}`).expect(200)).body;
    expect(profile.kyc).toMatchObject({ status: "UNDER_REVIEW", contact: { firstName: "Sara", lastName: "Ahmadi", mobile: "09120000000" }, documents: [{ kind: "NATIONAL_ID_CARD", status: "PENDING" }] });
    expect(JSON.stringify(profile)).not.toContain("objectKey");
    expect(profile.locations[0]).toMatchObject({ addressLine: "Valiasr 10", province: "Tehran", latitude: 35.7 });
    expect(profile.services[0]).toMatchObject({ name: "Full groom", isActive: false, priceAmount: 1_500_000, durationMinutes: 90, variants: [{ name: "Large dog", priceAmount: 2_000_000 }] });
    expect(profile.calendar.rules[0]).toMatchObject({ dayOfWeek: 6, start: "09:00", end: "17:00", staffName: "Owner Sara" });
    expect(profile.team).toEqual([expect.objectContaining({ role: "OWNER", displayName: "Owner Sara" })]);

    const shopProfile = (await get(ops, `/admin/partners/shops/${shop.id}`).expect(200)).body;
    expect(shopProfile).toMatchObject({ address: { province: "Tehran", postalCode: "1234567890" }, phone: "02100000000", pendingCatalogRequests: 0, linkedService: { id: org.id, serviceKinds: ["GROOMER", "BOARDING"] } });
    // Only well-formed opening hours are shown.
    expect(shopProfile.openingHours).toEqual([{ dayOfWeek: 6, open: "10:00", close: "20:00" }]);
    expect(shopProfile.offers.items[0]).toMatchObject({ productTitle: product.title, priceAmount: 2_000_000, available: 10, status: "PAUSED", moderationStatus: "PENDING_REVIEW" });
    expect(shopProfile.offers.pendingReview).toBe(1);
    expect(JSON.stringify(shopProfile)).not.toMatch(/iban|sheba|accountNumber/i);

    await get(ops, `/admin/partners/services/${randomUUID()}`).expect(404);
    await get(ops, "/admin/partners/shops/not-a-uuid").expect(400);
  });

  it("keeps a service admin to their own verticals and the commerce team to shops", async () => {
    const tag = randomUUID().slice(0, 8);
    const clinic = await db.providerOrganization.create({ data: { name: `Scope Clinic ${tag}`, type: "VET_CLINIC" } });
    const groomer = await db.providerOrganization.create({ data: { name: `Scope Groomer ${tag}`, type: "GROOMER" } });
    const groomingAdmin = await actor("Grooming Admin", AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]);
    const listed = (await get(groomingAdmin, `/admin/partners/services?q=${tag}`).expect(200)).body.items.map((o: { id: string }) => o.id);
    expect(listed).toContain(groomer.id);
    expect(listed).not.toContain(clinic.id);
    await get(groomingAdmin, `/admin/partners/services/${clinic.id}`).expect(404);
    await get(groomingAdmin, `/admin/partners/services/${groomer.id}`).expect(200);
  });

  it("allows only verification staff to archive never-submitted drafts and records the action", async () => {
    const tag = randomUUID().slice(0, 8);
    const ops = await actor("Verification staff", AdminRole.VERIFICATION);
    const customer = await actor("Customer without verification permission");
    const owner = await actor("Draft owner");
    const draft = await db.providerOrganization.create({
      data: { name: `Draft ${tag}`, type: "GROOMER", serviceKinds: ["GROOMER"], providerUsers: { create: { userId: owner.id, role: "OWNER" } } },
    });

    await post(customer, `/admin/verification/PROVIDER/${draft.id}/archive`).send({ reason: "Duplicate QA signup" }).expect(403);
    const archived = await post(ops, `/admin/verification/PROVIDER/${draft.id}/archive`).send({ reason: "Duplicate QA signup" }).expect(201);
    expect(archived.body).toMatchObject({ id: draft.id, archived: true, walletRetained: false });
    const stored = await db.providerOrganization.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored).toMatchObject({ onboardingArchiveReason: "ARCHIVED_BY_ADMIN", onboardingWalletRetained: false });
    expect(stored.onboardingArchivedAt).toBeInstanceOf(Date);
    expect(await db.providerUser.count({ where: { providerOrganizationId: draft.id, removedAt: null } })).toBe(0);
    expect(await db.adminAuditLog.count({ where: { adminUserId: (await db.adminUser.findUniqueOrThrow({ where: { userId: ops.id } })).id, action: "verification.draft_archived", entityId: draft.id } })).toBe(1);
    await get(ops, `/admin/partners/services?q=${encodeURIComponent(`Draft ${tag}`)}`).expect(200).expect((res) => expect(res.body.items).toEqual([]));

    const submitted = await db.providerOrganization.create({ data: { name: `Submitted ${tag}`, type: "GROOMER", verificationStatus: "SUBMITTED", verificationSubmittedAt: new Date() } });
    const refused = await post(ops, `/admin/verification/PROVIDER/${submitted.id}/archive`).send({ reason: "Do not archive submitted" }).expect(400);
    expect(refused.body.error.details?.reason).toBe("CANCELLATION_NOT_AVAILABLE");
    expect((await db.providerOrganization.findUniqueOrThrow({ where: { id: submitted.id } })).onboardingArchivedAt).toBeNull();
  });
});
