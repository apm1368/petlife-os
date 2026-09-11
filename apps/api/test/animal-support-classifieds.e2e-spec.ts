import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  const match = /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Could not parse OTP code from log line");
  return match[1]!;
}

async function primeCsrf(app: INestApplication): Promise<Cookies> {
  const res = await request(app.getHttpServer()).get("/health/live");
  return { csrf: extractCookie(res.headers["set-cookie"], "petlife_csrf") };
}

async function signUp(app: INestApplication, logSpy: jest.SpyInstance, identifier: string): Promise<Cookies> {
  const primed = await primeCsrf(app);
  await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier }).expect(200);
  const code = captureOtpCode(logSpy, identifier);
  const verifyRes = await request(app.getHttpServer())
    .post("/auth/verify-otp")
    .set("Cookie", `petlife_csrf=${primed.csrf}`)
    .set("x-csrf-token", primed.csrf!)
    .send({ identifier, code })
    .expect(200);
  return { session: extractCookie(verifyRes.headers["set-cookie"], "petlife_session"), csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

/**
 * Handoff 22 — Animal Support classifieds (Divar-style needs board).
 * Covers create → moderate → publish → discover → offer help → fulfill,
 * plus the privacy and authorization rules the spec is explicit about.
 */
describe("Animal Support classifieds (Handoff 22)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log");
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  async function setupUser(prefix = "h22") {
    const cookies = await signUp(app, logSpy, `${prefix}-${unique()}@example.com`);
    return authedRequest(app, cookies);
  }

  async function setupTrustAdmin() {
    const identifier = `h22-admin-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({ data: { userId: user.id, role: AdminRole.TRUST_SAFETY, status: AdminMembershipStatus.ACTIVE } });
    return client;
  }

  /** A listing that has actually been through moderation and is live. */
  async function publishedListing(publisher: ReturnType<typeof authedRequest>, overrides: Record<string, unknown> = {}) {
    const created = await publisher
      .post("/animal-support/needs")
      .send({
        title: `Dog food needed ${unique()}`,
        description: "We are caring for eight rescued dogs and have run out of food this week.",
        category: "FOOD",
        province: "Tehran",
        city: "Tehran",
        neededQuantity: 10,
        quantityUnit: "bags",
        ...overrides,
      })
      .expect(201);
    await publisher.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);
    const admin = await setupTrustAdmin();
    await admin.post(`/admin/animal-support/needs/${created.body.id}/review`).send({ status: "PUBLISHED" }).expect(201);
    return created.body.id as string;
  }

  // -- Creation + moderation ---------------------------------------------------

  it("a new listing starts as a DRAFT and is invisible publicly until an admin publishes it", async () => {
    const publisher = await setupUser();
    const created = await publisher
      .post("/animal-support/needs")
      .send({
        title: `Medicine needed ${unique()}`,
        description: "A rescued cat needs a course of antibiotics we cannot afford right now.",
        category: "MEDICINE",
        province: "Tehran",
        city: "Tehran",
      })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");

    await request(app.getHttpServer()).get(`/animal-support/needs/${created.body.id}`).expect(404);

    const submitted = await publisher.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);
    expect(submitted.body.status).toBe("PENDING_REVIEW");
    // Still not public while awaiting moderation.
    await request(app.getHttpServer()).get(`/animal-support/needs/${created.body.id}`).expect(404);

    const admin = await setupTrustAdmin();
    const published = await admin.post(`/admin/animal-support/needs/${created.body.id}/review`).send({ status: "PUBLISHED" }).expect(201);
    expect(published.body.status).toBe("PUBLISHED");
    expect(published.body.publishedAt).toBeTruthy();

    const anonymous = await request(app.getHttpServer()).get(`/animal-support/needs/${created.body.id}`).expect(200);
    expect(anonymous.body.title).toBe(created.body.title);
  });

  it("a rejection carries its note back to the publisher only, and the publisher can fix and resubmit", async () => {
    const publisher = await setupUser();
    const created = await publisher
      .post("/animal-support/needs")
      .send({ title: `Vague ask ${unique()}`, description: "Please help us, we need things for the animals.", category: "OTHER", province: "Fars", city: "Shiraz" })
      .expect(201);
    await publisher.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);

    const admin = await setupTrustAdmin();
    await admin.post(`/admin/animal-support/needs/${created.body.id}/review`).send({ status: "REJECTED", reviewNote: "Please describe exactly what you need." }).expect(201);

    const mine = await publisher.get(`/animal-support/needs/${created.body.id}/manage`).expect(200);
    expect(mine.body.status).toBe("REJECTED");
    expect(mine.body.reviewNote).toBe("Please describe exactly what you need.");

    await publisher.patch(`/animal-support/needs/${created.body.id}`).send({ description: "We need 20 bags of adult dog food for a shelter of 40 dogs in Shiraz." }).expect(200);
    const resubmitted = await publisher.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);
    expect(resubmitted.body.status).toBe("PENDING_REVIEW");
    // Resubmitting clears the stale moderation note.
    expect(resubmitted.body.reviewNote).toBeNull();
  });

  it("an admin can remove a live listing, which immediately drops out of public discovery", async () => {
    const publisher = await setupUser();
    const listingId = await publishedListing(publisher);
    await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}`).expect(200);

    const admin = await setupTrustAdmin();
    await admin.post(`/admin/animal-support/needs/${listingId}/review`).send({ status: "REMOVED", reviewNote: "Duplicate listing." }).expect(201);

    await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}`).expect(404);
    // The moderation decision is audited.
    const audit = await prisma.adminAuditLog.findFirst({ where: { entityType: "SupportNeedListing", entityId: listingId, action: "support_need_listing.removed" } });
    expect(audit).toBeTruthy();
  });

  // -- Discovery ---------------------------------------------------------------

  it("anonymous discovery supports category, city and free-text filters and never leaks the publisher's identity", async () => {
    const publisher = await setupUser();
    const foodId = await publishedListing(publisher, { title: `Kibble drive ${unique()}`, category: "FOOD", city: "Tehran", province: "Tehran" });
    const transportId = await publishedListing(publisher, {
      title: `Ride to the clinic ${unique()}`,
      description: "We need a volunteer to drive an injured street cat to a clinic across town.",
      category: "TRANSPORT",
      city: "Isfahan",
      province: "Isfahan",
    });

    const byCategory = await request(app.getHttpServer()).get("/animal-support/needs?category=TRANSPORT").expect(200);
    const categoryIds = byCategory.body.items.map((l: { id: string }) => l.id);
    expect(categoryIds).toContain(transportId);
    expect(categoryIds).not.toContain(foodId);

    const byCity = await request(app.getHttpServer()).get("/animal-support/needs?city=Isfahan").expect(200);
    expect(byCity.body.items.map((l: { id: string }) => l.id)).toContain(transportId);

    const bySearch = await request(app.getHttpServer()).get("/animal-support/needs?search=injured%20street%20cat").expect(200);
    expect(bySearch.body.items.map((l: { id: string }) => l.id)).toContain(transportId);

    // Publisher identity and moderation notes are never part of a public read.
    const publicItem = byCategory.body.items.find((l: { id: string }) => l.id === transportId);
    expect(publicItem.creatorUserId).toBeNull();
    expect(publicItem.reviewNote).toBeNull();

    const locations = await request(app.getHttpServer()).get("/animal-support/needs/locations").expect(200);
    expect(locations.body.some((l: { city: string }) => l.city === "Isfahan")).toBe(true);
  });

  it("publishing, offering help and managing listings all require authentication; browsing does not", async () => {
    const publisher = await setupUser();
    const listingId = await publishedListing(publisher);

    await request(app.getHttpServer()).get("/animal-support/needs").expect(200);
    await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}`).expect(200);

    // Anonymous writes are stopped by the CSRF guard (403) before auth is even considered...
    await request(app.getHttpServer()).post("/animal-support/needs").send({ title: "x", description: "y", category: "FOOD", province: "p", city: "c" }).expect(403);
    await request(app.getHttpServer()).post(`/animal-support/needs/${listingId}/offers`).send({ message: "I can help", helpType: "FOOD" }).expect(403);
    // ...while an anonymous read of a publisher-only view is an auth failure (401), since GET is CSRF-safe.
    await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}/manage`).expect(401);
  });

  // -- Help offers -------------------------------------------------------------

  it("a helper offers help, the publisher accepts and completes it, and fulfillment progress advances without exceeding the stated need", async () => {
    const publisher = await setupUser();
    const helper = await setupUser("h22-helper");
    const listingId = await publishedListing(publisher, { neededQuantity: 5, quantityUnit: "bags" });

    const offer = await helper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "I can bring four bags of food this weekend.", helpType: "FOOD", quantity: 4 }).expect(201);
    expect(offer.body.status).toBe("PENDING");

    const inbox = await publisher.get(`/animal-support/needs/${listingId}/offers`).expect(200);
    expect(inbox.body).toHaveLength(1);

    await publisher.patch(`/animal-support/needs/${listingId}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    const completed = await publisher.patch(`/animal-support/needs/${listingId}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 4 }).expect(200);
    expect(completed.body.status).toBe("COMPLETED");

    const afterPartial = await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}/summary`).expect(200);
    expect(afterPartial.body.fulfilledQuantity).toBe(4);
    expect(afterPartial.body.completedOffers).toBe(1);

    // A second, over-generous contribution is clamped to the stated need — progress can never exceed 100%.
    const secondHelper = await setupUser("h22-helper2");
    const secondOffer = await secondHelper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "I can bring ten more bags.", helpType: "FOOD", quantity: 10 }).expect(201);
    await publisher.patch(`/animal-support/needs/${listingId}/offers/${secondOffer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    await publisher.patch(`/animal-support/needs/${listingId}/offers/${secondOffer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 10 }).expect(200);

    const afterFull = await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}/summary`).expect(200);
    expect(afterFull.body.fulfilledQuantity).toBe(5);

    const fulfilled = await publisher.post(`/animal-support/needs/${listingId}/fulfill`).expect(201);
    expect(fulfilled.body.status).toBe("FULFILLED");
  });

  it("a helper cannot offer twice while an offer is open, cannot offer on their own listing, and only the publisher sees the offer inbox", async () => {
    const publisher = await setupUser();
    const helper = await setupUser("h22-helper");
    const stranger = await setupUser("h22-stranger");
    const listingId = await publishedListing(publisher);

    await helper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "I can help with this need.", helpType: "FOOD" }).expect(201);
    const duplicate = await helper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "Offering again.", helpType: "FOOD" }).expect(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE_HELP_OFFER");

    const ownOffer = await publisher.post(`/animal-support/needs/${listingId}/offers`).send({ message: "Helping myself.", helpType: "FOOD" }).expect(403);
    expect(ownOffer.body.error.code).toBe("SUPPORT_NEED_LISTING_ACCESS_DENIED");

    // The inbox is the publisher's alone — a stranger cannot read who offered help.
    await stranger.get(`/animal-support/needs/${listingId}/offers`).expect(403);
  });

  it("a helper may cancel their own offer, but only the publisher can accept or decline one", async () => {
    const publisher = await setupUser();
    const helper = await setupUser("h22-helper");
    const listingId = await publishedListing(publisher);

    const offer = await helper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "I can foster for two weeks.", helpType: "FOSTER" }).expect(201);

    // A helper accepting their own offer is not a legal move.
    await helper.patch(`/animal-support/needs/${listingId}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(403);

    const cancelled = await helper.patch(`/animal-support/needs/${listingId}/offers/${offer.body.id}`).send({ status: "CANCELLED" }).expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    // A resolved offer is terminal.
    await publisher.patch(`/animal-support/needs/${listingId}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(409);

    // Having cancelled, the helper is free to offer again.
    await helper.post(`/animal-support/needs/${listingId}/offers`).send({ message: "Actually I can foster after all.", helpType: "FOSTER" }).expect(201);
  });

  it("offers are only accepted on a live listing", async () => {
    const publisher = await setupUser();
    const helper = await setupUser("h22-helper");
    const draft = await publisher
      .post("/animal-support/needs")
      .send({ title: `Not yet live ${unique()}`, description: "This listing has not been submitted for review yet at all.", category: "EQUIPMENT", province: "Tehran", city: "Tehran" })
      .expect(201);

    await helper.post(`/animal-support/needs/${draft.body.id}/offers`).send({ message: "Can I help with this?", helpType: "EQUIPMENT" }).expect(409);
  });

  // -- Publisher ownership -----------------------------------------------------

  it("only the publisher can edit, fulfill or close their listing", async () => {
    const publisher = await setupUser();
    const stranger = await setupUser("h22-stranger");
    const listingId = await publishedListing(publisher);

    await stranger.patch(`/animal-support/needs/${listingId}`).send({ title: "Hijacked listing" }).expect(403);
    await stranger.post(`/animal-support/needs/${listingId}/fulfill`).expect(403);
    await stranger.post(`/animal-support/needs/${listingId}/close`).expect(403);

    const closed = await publisher.post(`/animal-support/needs/${listingId}/close`).expect(201);
    expect(closed.body.status).toBe("CLOSED");
    // A closed listing leaves public discovery, and is the publisher's final word.
    await request(app.getHttpServer()).get(`/animal-support/needs/${listingId}`).expect(404);
    await publisher.post(`/animal-support/needs/${listingId}/fulfill`).expect(409);
  });

  it("My Listings shows the publisher's own listings across every status, and never another publisher's", async () => {
    const publisher = await setupUser();
    const other = await setupUser("h22-other");
    const mineId = await publishedListing(publisher);
    const theirsId = await publishedListing(other);

    const mine = await publisher.get("/animal-support/needs/mine").expect(200);
    const mineIds = mine.body.items.map((l: { id: string }) => l.id);
    expect(mineIds).toContain(mineId);
    expect(mineIds).not.toContain(theirsId);
    // The publisher's own view does carry their identity and any moderation note.
    expect(mine.body.items[0].creatorUserId).toBeTruthy();

    const filtered = await publisher.get("/animal-support/needs/mine?status=PUBLISHED").expect(200);
    expect(filtered.body.items.every((l: { status: string }) => l.status === "PUBLISHED")).toBe(true);
  });

  it("a listing that accepts money points at an existing campaign rather than holding its own balance", async () => {
    const publisher = await setupUser();
    const organization = await prisma.animalSupportOrganization.create({
      data: { type: "SHELTER", name: `H22 Shelter ${unique()}`, verificationStatus: "VERIFIED", isPubliclyListed: true },
    });
    const campaign = await prisma.supportCampaign.create({
      data: { organizationId: organization.id, title: `H22 Campaign ${unique()}`, description: "Ongoing care costs", status: "ACTIVE" },
    });

    const created = await publisher
      .post("/animal-support/needs")
      .send({
        title: `Treatment costs ${unique()}`,
        description: "We need help covering surgery costs for a rescued dog hit by a car last week.",
        category: "FINANCIAL",
        province: "Tehran",
        city: "Tehran",
        organizationId: organization.id,
        campaignId: campaign.id,
        contactMode: "DONATE",
      })
      .expect(201);

    expect(created.body.campaignId).toBe(campaign.id);
    expect(created.body.organizationId).toBe(organization.id);
    // The listing itself carries no money column at all — the ledger stays the single source of truth.
    expect(created.body).not.toHaveProperty("raisedAmountIrr");
    expect(created.body).not.toHaveProperty("balanceIrr");
  });
});
