import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PartnerSubjectType } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PartnerOnboardingVerificationListener } from "../src/modules/partner-onboarding/partner-onboarding.listener";

type Client = {
  id: string;
  get: (p: string) => request.Test;
  put: (p: string) => request.Test;
  post: (p: string) => request.Test;
};

/** Partner signup ("ثبت‌نام همکار"): own organizations only, private KYC documents, nothing live before verification. */
describe("Partner onboarding (e2e)", () => {
  let app: INestApplication;
  let db: PrismaService;
  let csrf: string;
  const u = () => randomUUID().slice(0, 8);

  async function member(name: string, opts: { verifiedPhone?: boolean } = {}): Promise<Client> {
    const user = await db.user.create({
      data: {
        displayName: name,
        email: `partner-${randomUUID()}@example.com`,
        ...(opts.verifiedPhone ? { phone: `+98912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`, phoneVerifiedAt: new Date() } : {}),
      },
    });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const s = () => app.getHttpServer();
    return {
      id: user.id,
      get: (p) => request(s()).get(p).set("Cookie", cookie),
      put: (p) => request(s()).put(p).set("Cookie", cookie).set("x-csrf-token", csrf),
      post: (p) => request(s()).post(p).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }

  async function catalogVariant() {
    const category = await db.productCategory.create({ data: { name: `PO Cat ${u()}`, slug: `po-cat-${u()}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `PO Food ${u()}`, slug: `po-food-${u()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    return db.productVariant.create({ data: { productId: product.id, sku: `PO-${u()}`, title: "2 kg" } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  });
  afterAll(async () => app.close());

  it("creates a linked vet + shop for a partner, never a household or pet-owner onboarding, and nothing goes live before verification", async () => {
    const partner = await member("Dr. Partner", { verifiedPhone: true });

    // Not a partner yet: the pet-owner flow is untouched.
    expect((await partner.get("/onboarding").expect(200)).body).toMatchObject({ signupIntent: "PET_OWNER", partnerStage: "NONE" });
    await partner.post("/partner-onboarding/start").send({ serviceKinds: [], shop: false, businessName: "x" }).expect(400);
    const started = (await partner.post("/partner-onboarding/start").send({ serviceKinds: ["VET_CLINIC", "GROOMER"], shop: true, businessName: "کلینیک و پت‌شاپ آریا" }).expect(201)).body;
    expect(started).toMatchObject({ started: true, shop: true, linked: true, serviceKinds: ["VET_CLINIC", "GROOMER"], submitted: false });

    const provider = await db.providerOrganization.findUniqueOrThrow({ where: { id: started.providerOrganizationId } });
    expect(provider).toMatchObject({ type: "VET_CLINIC", verificationStatus: "NOT_STARTED", linkedSellerOrganizationId: started.sellerOrganizationId });
    const seller = await db.sellerOrganization.findUniqueOrThrow({ where: { id: started.sellerOrganizationId } });
    expect(seller).toMatchObject({ status: "PENDING", verificationStatus: "NOT_STARTED" });
    expect(await db.providerUser.count({ where: { providerOrganizationId: provider.id, userId: partner.id, role: "OWNER" } })).toBe(1);
    expect(await db.sellerMembership.count({ where: { sellerOrganizationId: seller.id, userId: partner.id, role: "OWNER" } })).toBe(1);
    // A partner signup never creates a household or a pet-owner onboarding.
    expect(await db.householdMember.count({ where: { userId: partner.id } })).toBe(0);
    expect(await db.onboardingProgress.count({ where: { userId: partner.id } })).toBe(0);
    expect((await partner.get("/onboarding").expect(200)).body).toMatchObject({ signupIntent: "PARTNER", partnerStage: "IN_PROGRESS" });

    await partner.put("/partner-onboarding/business").send({ name: "کلینیک و پت‌شاپ آریا", description: "دامپزشکی و پت‌شاپ" }).expect(200);
    // A logo is only ever an object key issued to this account; a URL (even one containing the right path), another
    // account's key or a path trick is refused, and a URL field is not accepted at all.
    await partner.put("/partner-onboarding/business").send({ name: "Aria", logoUrl: "https://cdn.example/partner-logos/x/logo.png" }).expect(400);
    for (const logoObjectKey of [
      `https://evil.example/partner-logos/${partner.id}/${randomUUID()}.png`,
      `partner-logos/${randomUUID()}/${randomUUID()}.png`,
      `partner-logos/${partner.id}/../${randomUUID()}.png`,
      `partner-logos/${partner.id}/${randomUUID()}.svg`,
    ]) await partner.put("/partner-onboarding/business").send({ name: "Aria", logoObjectKey }).expect(400);
    const issued = (await partner.post("/partner-onboarding/logo-upload").send({ contentType: "image/png", fileSizeBytes: 2048 }).expect(201)).body as { key: string };
    expect(issued.key).toMatch(new RegExp(`^partner-logos/${partner.id}/`));
    await partner.put("/partner-onboarding/business").send({ name: "کلینیک و پت‌شاپ آریا", description: "دامپزشکی و پت‌شاپ", logoObjectKey: issued.key }).expect(200);
    const withLogo = await db.providerOrganization.findFirstOrThrow({ where: { providerUsers: { some: { userId: partner.id } } } });
    expect(withLogo.logoUrl).toContain(issued.key);
    expect(withLogo.logoUrl).not.toContain("evil.example");
    await partner.put("/partner-onboarding/owner").send({ firstName: "آرش", lastName: "رضایی", phone: "021-88001122" }).expect(200);
    await partner.put("/partner-onboarding/calendar").send({ days: [{ dayOfWeek: 6, start: "09:00", end: "18:00" }] }).expect(400);
    await partner.put("/partner-onboarding/address").send({ province: "تهران", city: "تهران", addressLine: "خیابان ولیعصر، پلاک ۱۲", postalCode: "1234567890", latitude: 35.75, longitude: 51.41, locationConsent: true }).expect(200);
    await partner.put("/partner-onboarding/calendar").send({ days: [{ dayOfWeek: 6, start: "18:00", end: "09:00" }] }).expect(400);
    await partner.put("/partner-onboarding/calendar").send({ days: [{ dayOfWeek: 6, start: "09:00", end: "18:00" }, { dayOfWeek: 0, start: "09:00", end: "18:00" }] }).expect(200);
    await partner.put("/partner-onboarding/services").send({ services: [{ kind: "PET_TAXI", name: "تاکسی", priceIrr: 1_000_000, durationMinutes: 30, maxPets: 1 }] }).expect(400);
    await partner.put("/partner-onboarding/services").send({ services: [
      { kind: "VET_CLINIC", name: "ویزیت عمومی", priceIrr: 12_000_000, durationMinutes: 30, maxPets: 1 },
      { kind: "GROOMER", name: "حمام و آرایش", priceIrr: 8_000_000, durationMinutes: 60, maxPets: 2 },
    ] }).expect(200);
    await partner.put("/partner-onboarding/opening-hours").send({ days: [{ dayOfWeek: 6, start: "10:00", end: "21:00" }] }).expect(200);
    const variant = await catalogVariant();
    await partner.put("/partner-onboarding/products").send({ items: [{ productVariantId: randomUUID(), priceIrr: 500_000, stock: 3 }] }).expect(400);
    await partner.put("/partner-onboarding/products").send({ items: [{ productVariantId: variant.id, priceIrr: 5_000_000, stock: 7 }] }).expect(200);

    // KYC documents: private keys only, per business; a key issued for one business can't be filed on the other.
    const docs = { NATIONAL_ID_CARD: "", BUSINESS_LICENSE: "", LICENSE: "" } as Record<string, string>;
    for (const subject of ["PROVIDER", "SELLER"] as const) {
      for (const kind of Object.keys(docs)) {
        if (subject === "SELLER" && kind === "LICENSE") continue;
        const target = (await partner.post("/partner-onboarding/documents/upload").send({ subject, contentType: "image/png", fileSizeBytes: 2048 }).expect(201)).body;
        expect(target.key).toMatch(new RegExp(`^partner-verification/${subject === "PROVIDER" ? "provider" : "seller"}/`));
        await partner.post("/partner-onboarding/documents").send({ subject, objectKey: target.key, kind, contentType: "image/png", fileSizeBytes: 2048 }).expect(201);
        docs[kind] = target.key;
      }
    }
    const providerKey = (await partner.post("/partner-onboarding/documents/upload").send({ subject: "PROVIDER", contentType: "image/png", fileSizeBytes: 2048 }).expect(201)).body.key;
    await partner.post("/partner-onboarding/documents").send({ subject: "SELLER", objectKey: providerKey, kind: "OTHER", contentType: "image/png", fileSizeBytes: 2048 }).expect(400);
    const state = (await partner.get("/partner-onboarding").expect(200)).body;
    expect(JSON.stringify(state)).not.toContain("partner-verification/");
    expect(state.verification.find((v: { subject: string }) => v.subject === "PROVIDER").documents.length).toBeGreaterThanOrEqual(3);

    // Nothing is live before verification.
    expect(await db.providerService.count({ where: { providerOrganizationId: provider.id, isActive: true } })).toBe(0);
    expect(await db.sellerOffer.findFirstOrThrow({ where: { sellerOrganizationId: seller.id } })).toMatchObject({ status: "PAUSED", moderationStatus: "PENDING_REVIEW" });
    const publicOffers = (await request(app.getHttpServer()).get(`/shop/products/${variant.productId}/offers`)).body;
    expect(JSON.stringify(publicOffers)).not.toContain(seller.id);

    // Someone else can neither read nor change this draft.
    const stranger = await member("Stranger", { verifiedPhone: true });
    expect((await stranger.get("/partner-onboarding").expect(200)).body).toMatchObject({ started: false, providerOrganizationId: null, sellerOrganizationId: null });
    await stranger.put("/partner-onboarding/business").send({ name: "Hijack" }).expect(400);
    await stranger.post("/partner-onboarding/documents").send({ subject: "PROVIDER", objectKey: docs.NATIONAL_ID_CARD, kind: "OTHER", contentType: "image/png", fileSizeBytes: 2048 }).expect(400);
    expect((await stranger.post("/partner-onboarding/cancel").send({}).expect(400)).body.error.details?.reason).toBe("NOT_STARTED");
    expect((await db.providerOrganization.findUniqueOrThrow({ where: { id: provider.id } })).name).toBe("کلینیک و پت‌شاپ آریا");

    // Submit hands both businesses to KYC; the wizard then reads as submitted.
    const submitted = (await partner.post("/partner-onboarding/submit").expect(201)).body;
    expect(submitted.submitted).toBe(true);
    expect((await db.providerOrganization.findUniqueOrThrow({ where: { id: provider.id } })).verificationStatus).toBe("SUBMITTED");
    expect((await db.sellerOrganization.findUniqueOrThrow({ where: { id: seller.id } })).verificationStatus).toBe("SUBMITTED");
    expect((await partner.get("/onboarding").expect(200)).body).toMatchObject({ partnerStage: "SUBMITTED" });
    const cancelledSubmission = await partner.post("/partner-onboarding/cancel").send({}).expect(400);
    expect(cancelledSubmission.body.error.details?.reason).toBe("CANCELLATION_NOT_AVAILABLE");
    await partner.put("/partner-onboarding/business").send({ name: "Changed after submit" }).expect(400);

    // Staff approval (simulated here) makes what the partner prepared go live; offers still await moderation.
    await db.providerOrganization.update({ where: { id: provider.id }, data: { verificationStatus: "VERIFIED" } });
    await db.sellerOrganization.update({ where: { id: seller.id }, data: { verificationStatus: "VERIFIED" } });
    const listener = app.get(PartnerOnboardingVerificationListener);
    expect(await listener.goLive({ subjectType: PartnerSubjectType.PROVIDER, subjectId: provider.id, from: "UNDER_REVIEW", to: "VERIFIED" })).toBe(true);
    expect(await listener.goLive({ subjectType: PartnerSubjectType.SELLER, subjectId: seller.id, from: "UNDER_REVIEW", to: "VERIFIED" })).toBe(true);
    expect(await db.providerService.count({ where: { providerOrganizationId: provider.id, isActive: true } })).toBe(2);
    expect((await db.sellerOrganization.findUniqueOrThrow({ where: { id: seller.id } })).status).toBe("ACTIVE");
    expect(await db.sellerOffer.findFirstOrThrow({ where: { sellerOrganizationId: seller.id } })).toMatchObject({ status: "ACTIVE", moderationStatus: "PENDING_REVIEW" });
  });

  it("refuses the owner step without a confirmed mobile, and never touches an organization the user did not create through signup", async () => {
    const partner = await member("No phone");
    await partner.post("/partner-onboarding/start").send({ serviceKinds: ["GROOMER"], shop: false, businessName: "سالن پشمالو" }).expect(201);
    const res = await partner.put("/partner-onboarding/owner").send({ firstName: "Sara", lastName: "K", phone: "02188000000" }).expect(400);
    expect(res.body.error.details?.reason).toBe("VERIFIED_MOBILE_REQUIRED");
    // A grooming-only partner has no shop step.
    await partner.put("/partner-onboarding/opening-hours").send({ days: [{ dayOfWeek: 6, start: "10:00", end: "21:00" }] }).expect(400);
  });

  it("cancels only an unsubmitted signup, removes unused wallets and roles, and clears the account deletion blocker", async () => {
    const partner = await member("Cancel signup");
    const started = (await partner.post("/partner-onboarding/start").send({ serviceKinds: ["GROOMER"], shop: true, businessName: "Draft business" }).expect(201)).body;
    const providerWallet = await db.walletAccount.create({ data: { ownerType: "PROVIDER", providerOrganizationId: started.providerOrganizationId } });
    const sellerWallet = await db.walletAccount.create({ data: { ownerType: "SELLER", sellerOrganizationId: started.sellerOrganizationId } });

    const cancelled = (await partner.post("/partner-onboarding/cancel").send({}).expect(201)).body;
    expect(cancelled).toMatchObject({ started: false, signupIntent: "PET_OWNER", providerOrganizationId: null, sellerOrganizationId: null });
    expect(await db.providerOrganization.findUnique({ where: { id: started.providerOrganizationId } })).toBeNull();
    expect(await db.sellerOrganization.findUnique({ where: { id: started.sellerOrganizationId } })).toBeNull();
    expect(await db.walletAccount.findUnique({ where: { id: providerWallet.id } })).toBeNull();
    expect(await db.walletAccount.findUnique({ where: { id: sellerWallet.id } })).toBeNull();
    expect(await db.providerUser.count({ where: { userId: partner.id, removedAt: null } })).toBe(0);
    expect(await db.sellerMembership.count({ where: { userId: partner.id, status: "ACTIVE" } })).toBe(0);
    const deletion = (await partner.get("/account/privacy/deletion/preview").expect(200)).body;
    expect(deletion.canRequest).toBe(true);
    expect(deletion.blockers.some((b: { code: string }) => b.code === "PARTNER_ROLES")).toBe(false);
  });

  it("retains and flags a wallet with an existing request while revoking the cancelled owner's role", async () => {
    const partner = await member("Wallet retained");
    const started = (await partner.post("/partner-onboarding/start").send({ serviceKinds: [], shop: true, businessName: "Shop draft" }).expect(201)).body;
    const wallet = await db.walletAccount.create({ data: { ownerType: "SELLER", sellerOrganizationId: started.sellerOrganizationId } });
    await db.walletTopUp.create({ data: { userId: partner.id, walletAccountId: wallet.id, rail: "CARD_TO_CARD", status: "AWAITING_RECEIPT", amount: 1000, idempotencyKey: randomUUID() } });

    const cancelled = (await partner.post("/partner-onboarding/cancel").send({}).expect(201)).body;
    expect(cancelled.started).toBe(false);
    const seller = await db.sellerOrganization.findUniqueOrThrow({ where: { id: started.sellerOrganizationId } });
    expect(seller).toMatchObject({ onboardingArchiveReason: "CANCELLED_BY_OWNER", onboardingWalletRetained: true, status: "INACTIVE" });
    expect(seller.onboardingArchivedAt).toBeInstanceOf(Date);
    expect(await db.walletAccount.findUnique({ where: { id: wallet.id } })).not.toBeNull();
    expect(await db.sellerMembership.count({ where: { userId: partner.id, sellerOrganizationId: seller.id, status: "ACTIVE" } })).toBe(0);
    const deletion = (await partner.get("/account/privacy/deletion/preview").expect(200)).body;
    expect(deletion.blockers.some((b: { code: string }) => b.code === "PARTNER_ROLES")).toBe(false);
  });
});
