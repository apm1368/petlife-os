import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { BookingStatus, ProviderUserRole, SellerMembershipRole, SellerMembershipStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string };

/** The partner business home: only the caller's own businesses, today's essentials, money only for finance roles. */
describe("Business home (e2e)", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `hub-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("lists only the caller's businesses with what needs them, and nothing for anyone else", async () => {
    const owner = await actor("Clinic and shop owner");
    const stranger = await actor("Someone else");
    const pet = await actor("Pet owner");

    const clinic = await db.providerOrganization.create({ data: { name: `Hub clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: clinic.id, role: ProviderUserRole.OWNER } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: clinic.id, addressLine: "Valiasr 1", city: "تهران", countryCode: "IR", timezone: "Asia/Tehran" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: clinic.id, name: "General visit", type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30, priceAmount: 12_000_000, currency: "IRR", isActive: true } });
    const household = await db.household.create({ data: { name: "Hub household", members: { create: { userId: pet.id, role: "OWNER" } } } });
    const cat = await db.pet.create({ data: { householdId: household.id, name: "Mishi", species: "CAT" } });
    const startAt = new Date(Date.now() + 2 * 86_400_000);
    await db.booking.create({ data: { householdId: household.id, petId: cat.id, userId: pet.id, providerOrganizationId: clinic.id, providerLocationId: location.id, providerServiceId: service.id, category: "VET", locationMode: "AT_PROVIDER", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), timezone: "Asia/Tehran", bookingStatus: BookingStatus.PENDING_CONFIRMATION } });

    const shop = await db.sellerOrganization.create({ data: { name: `Hub shop ${randomUUID().slice(0, 6)}`, countryCode: "IR" } });
    await db.sellerMembership.create({ data: { sellerOrganizationId: shop.id, userId: owner.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE } });
    // A viewer of another shop sees its counts but not its money.
    const otherShop = await db.sellerOrganization.create({ data: { name: `Viewer shop ${randomUUID().slice(0, 6)}`, countryCode: "IR" } });
    await db.sellerMembership.create({ data: { sellerOrganizationId: otherShop.id, userId: owner.id, role: SellerMembershipRole.VIEWER, status: SellerMembershipStatus.ACTIVE } });
    // An invitation that was never accepted is not a membership.
    const invited = await db.sellerOrganization.create({ data: { name: `Invited shop ${randomUUID().slice(0, 6)}`, countryCode: "IR" } });
    await db.sellerMembership.create({ data: { sellerOrganizationId: invited.id, userId: owner.id, role: SellerMembershipRole.ADMIN, status: SellerMembershipStatus.PENDING } });

    await get(null, "/business/overview").expect(401);
    await get(null, "/business/memberships").expect(401);

    const memberships = (await get(owner, "/business/memberships").expect(200)).body;
    expect(memberships.services.map((s: { providerOrganizationId: string }) => s.providerOrganizationId)).toEqual([clinic.id]);
    expect(memberships.shops.map((s: { sellerOrganizationId: string }) => s.sellerOrganizationId).sort()).toEqual([shop.id, otherShop.id].sort());
    expect(memberships.hasHousehold).toBe(false);

    const overview = (await get(owner, "/business/overview").expect(200)).body;
    const clinicCard = overview.services[0];
    expect(clinicCard).toMatchObject({ providerOrganizationId: clinic.id, role: "OWNER", verificationStatus: "VERIFIED", counts: { upcoming: 1, pendingConfirmation: 1 } });
    expect(clinicCard.nextBookings[0]).toMatchObject({ serviceName: "General visit", petName: "Mishi", status: "PENDING_CONFIRMATION" });
    expect(clinicCard.services).toMatchObject({ total: 1, active: 1, items: [{ name: "General visit", durationMinutes: 30, priceAmount: 12_000_000 }] });
    const ownShop = overview.shops.find((s: { sellerOrganizationId: string }) => s.sellerOrganizationId === shop.id);
    const viewerShop = overview.shops.find((s: { sellerOrganizationId: string }) => s.sellerOrganizationId === otherShop.id);
    expect(ownShop.balance).toEqual({ pendingIrr: expect.any(Number), availableIrr: expect.any(Number), paidIrr: expect.any(Number) });
    expect(viewerShop.balance).toBeNull();
    expect(viewerShop.counts).toMatchObject({ ordersToPrepare: 0, lowStockOffers: 0, offersPendingModeration: 0, activeOffers: 0 });

    // Nobody else sees these businesses: their own (empty) home only.
    const strangers = (await get(stranger, "/business/overview").expect(200)).body;
    expect(strangers).toEqual({ services: [], shops: [], hasHousehold: false });
    const petOwner = (await get(pet, "/business/memberships").expect(200)).body;
    expect(petOwner).toMatchObject({ services: [], shops: [], hasHousehold: true });
  });

  it("drops a provider membership once the person is removed from the team", async () => {
    const former = await actor("Former vet");
    const clinic = await db.providerOrganization.create({ data: { name: `Old clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC" } });
    await db.providerUser.create({ data: { userId: former.id, providerOrganizationId: clinic.id, role: ProviderUserRole.VET, removedAt: new Date() } });
    expect((await get(former, "/business/memberships").expect(200)).body.services).toEqual([]);
  });
});
