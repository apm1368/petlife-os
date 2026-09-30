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
  return /code=(\d+)/.exec(call[0] as string)![1]!;
}

// Exact test coordinates — distinctive digits so any leak is unmistakable in a serialized body.
const EXACT_LAT = 35.7218364;
const EXACT_LNG = 51.3354171;

/** True when the serialized payload contains the exact coordinates (as numbers, at any precision beyond 3 decimals). */
function leaksExactCoordinates(body: unknown): boolean {
  const json = JSON.stringify(body);
  return json.includes("35.7218") || json.includes("51.3354");
}

/**
 * Batch 6 — Lost Pet, Animal Support, Donations, NGO/Shelter, Community and
 * Trust & Safety through the real HTTP surface.
 */
describe("Batch 6 — Animal support ecosystem", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  async function eventually(check: () => Promise<boolean>, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Condition not met in time");
  }

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function signUp(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf");
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier }).expect(200);
    const code = captureOtpCode(logSpy, identifier);
    const verify = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier, code }).expect(200);
    return { session: extractCookie(verify.headers["set-cookie"], "petlife_session"), csrf };
  }

  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (url: string) => request(server).get(url).set("Cookie", cookie),
      post: (url: string) => request(server).post(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (url: string) => request(server).patch(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (url: string) => request(server).put(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (url: string) => request(server).delete(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  type Client = ReturnType<typeof client>;

  async function user(prefix = "b6-user") {
    const identifier = `${prefix}-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const row = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    return { c, userId: row.id, email: identifier };
  }

  async function owner(petName = "Cookie") {
    const u = await user("b6-owner");
    const household = await u.c.post("/households").send({}).expect(201);
    const pet = await u.c.post(`/households/${household.body.id}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 30 }).expect(201);
    return { ...u, householdId: household.body.id as string, petId: pet.body.id as string };
  }

  async function admin(role: AdminRole) {
    const u = await user(`b6-admin-${role.toLowerCase()}`);
    await prisma.adminUser.create({ data: { userId: u.userId, role, status: AdminMembershipStatus.ACTIVE } });
    return u;
  }

  /** A published support listing with exact private coordinates. */
  async function publishedNeed(publisher: Client, moderator: Client, extra: Record<string, unknown> = {}) {
    const created = await publisher
      .post("/animal-support/needs")
      .send({ title: `Dry food for street cats ${unique()}`, description: "Ten bags of dry food for a colony of twelve cats.", category: "FOOD", urgency: "URGENT", province: "تهران", city: "تهران", neighborhood: "یوسف‌آباد", latitude: EXACT_LAT, longitude: EXACT_LNG, neededQuantity: 10, quantityUnit: "bag", ...extra })
      .expect(201);
    await publisher.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);
    await moderator.post(`/admin/animal-support/needs/${created.body.id}/review`).send({ status: "PUBLISHED" }).expect(201);
    return created.body.id as string;
  }

  // ------------------------------------------------------------------ 6A privacy

  describe("location privacy", () => {
    it("anonymous public lost-pet responses never carry exact coordinates or the private location text", async () => {
      const o = await owner();
      const incident = await o.c
        .post(`/pets/${o.petId}/lost-incidents`)
        .send({ description: "Slipped his harness near the park", publicArea: "Yousefabad, near Shafagh park", lastKnownLocation: "No. 14, Alley 7, Yousefabad", lastKnownLatitude: EXACT_LAT, lastKnownLongitude: EXACT_LNG, privateNotes: "Chip 982000123", contactPreference: "IN_APP_MESSAGE" })
        .expect(201);
      const id = incident.body.id as string;

      const detail = await request(server).get(`/lost-pets/${id}`).expect(200);
      expect(leaksExactCoordinates(detail.body)).toBe(false);
      expect(JSON.stringify(detail.body)).not.toContain("Alley 7");
      expect(detail.body.approximateArea).toBe("Yousefabad, near Shafagh park");
      for (const key of ["lastKnownLatitude", "lastKnownLongitude", "lastKnownLocation", "privateNotes", "householdId", "createdByUserId", "primaryPhotoObjectKey"]) expect(detail.body).not.toHaveProperty(key);

      const list = await request(server).get("/lost-pets?pageSize=48").expect(200);
      expect(list.body.items.some((i: { id: string }) => i.id === id)).toBe(true);
      expect(leaksExactCoordinates(list.body)).toBe(false);
      expect(JSON.stringify(list.body)).not.toContain("Alley 7");

      // Sharing to the community copies only the public area, never the private location.
      const post = await o.c.post(`/pets/${o.petId}/lost-incidents/${id}/share-to-community`).expect(201);
      expect(JSON.stringify(post.body)).not.toContain("Alley 7");
      expect(post.body.body).toContain("Yousefabad, near Shafagh park");
    });

    it("anonymous public support-listing, organization and rescue-case responses never carry exact coordinates", async () => {
      const publisher = await user("b6-publisher");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(publisher.c, mod.c);

      const detail = await request(server).get(`/animal-support/needs/${needId}`).expect(200);
      expect(leaksExactCoordinates(detail.body)).toBe(false);
      expect(detail.body.latitude).toBeNull();
      expect(detail.body.longitude).toBeNull();
      expect(detail.body.neighborhood).toBe("یوسف‌آباد");
      expect(detail.body.creatorUserId).toBeNull();
      const list = await request(server).get("/animal-support/needs?pageSize=50").expect(200);
      expect(list.body.items.some((i: { id: string }) => i.id === needId)).toBe(true);
      expect(leaksExactCoordinates(list.body)).toBe(false);

      const ops = await admin(AdminRole.ADMIN);
      const org = await ops.c.post("/admin/animal-support/organizations").send({ type: "SHELTER", name: `Shelter ${unique()}`, location: "Karaj", latitude: EXACT_LAT, longitude: EXACT_LNG }).expect(201);
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/verification`).send({ verificationStatus: "VERIFIED" }).expect(201);
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/listing`).send({ isPubliclyListed: true }).expect(201);
      const rescue = await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/rescue-cases`).send({ title: "Injured dog by the highway", description: "Needs surgery", location: "Karaj highway", latitude: EXACT_LAT, longitude: EXACT_LNG }).expect(201);
      const publicOrg = await request(server).get(`/animal-support/organizations/${org.body.id}`).expect(200);
      expect(leaksExactCoordinates(publicOrg.body)).toBe(false);
      expect(publicOrg.body.location).toBe("Karaj");
      const publicCase = await request(server).get(`/animal-support/rescue-cases/${rescue.body.id}`).expect(200);
      expect(leaksExactCoordinates(publicCase.body)).toBe(false);
      expect(publicCase.body.location).toBe("Karaj highway");
      const cases = await request(server).get(`/animal-support/rescue-cases?pageSize=50`).expect(200);
      expect(cases.body.items.some((c: { id: string }) => c.id === rescue.body.id)).toBe(true);
      expect(leaksExactCoordinates(cases.body)).toBe(false);
      // Operators keep the exact coordinates.
      expect((await ops.c.get(`/admin/animal-support/rescue-cases/${rescue.body.id}`).expect(200)).body.latitude).toBe(EXACT_LAT);
    });

    it("the owner, the publisher and operators still receive the exact location they need", async () => {
      const o = await owner();
      const incident = await o.c
        .post(`/pets/${o.petId}/lost-incidents`)
        .send({ description: "Lost at dusk", publicArea: "Vanak square", lastKnownLocation: "Behind the bakery on Mollasadra", lastKnownLatitude: EXACT_LAT, lastKnownLongitude: EXACT_LNG })
        .expect(201);
      const mine = await o.c.get(`/pets/${o.petId}/lost-incidents/${incident.body.id}`).expect(200);
      expect(mine.body.lastKnownLatitude).toBe(EXACT_LAT);
      expect(mine.body.lastKnownLongitude).toBe(EXACT_LNG);
      expect(mine.body.lastKnownLocation).toBe("Behind the bakery on Mollasadra");
      expect(mine.body.publicArea).toBe("Vanak square");

      const publisher = await user("b6-publisher");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(publisher.c, mod.c);
      const manage = await publisher.c.get(`/animal-support/needs/${needId}/manage`).expect(200);
      expect(manage.body.latitude).toBe(EXACT_LAT);
      expect(manage.body.longitude).toBe(EXACT_LNG);
      const adminView = await mod.c.get(`/admin/animal-support/needs/${needId}`).expect(200);
      expect(adminView.body.latitude).toBe(EXACT_LAT);
    });

    it("changing ids never exposes another user's private coordinates", async () => {
      const victim = await owner("Nazi");
      const attacker = await owner("Other");
      const incident = await victim.c.post(`/pets/${victim.petId}/lost-incidents`).send({ description: "Lost", lastKnownLatitude: EXACT_LAT, lastKnownLongitude: EXACT_LNG }).expect(201);
      const id = incident.body.id as string;
      // The attacker's own pet id with the victim's incident id, and the victim's pet id directly.
      const viaOwnPet = await attacker.c.get(`/pets/${attacker.petId}/lost-incidents/${id}`);
      expect([403, 404]).toContain(viaOwnPet.status);
      expect(leaksExactCoordinates(viaOwnPet.body)).toBe(false);
      const viaVictimPet = await attacker.c.get(`/pets/${victim.petId}/lost-incidents/${id}`);
      expect([403, 404]).toContain(viaVictimPet.status);
      expect(leaksExactCoordinates(viaVictimPet.body)).toBe(false);
      const sightings = await attacker.c.get(`/pets/${victim.petId}/lost-incidents/${id}/sightings`);
      expect([403, 404]).toContain(sightings.status);

      const publisher = await user("b6-publisher");
      const other = await user("b6-other");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(publisher.c, mod.c);
      const manage = await other.c.get(`/animal-support/needs/${needId}/manage`);
      expect([403, 404]).toContain(manage.status);
      expect(leaksExactCoordinates(manage.body)).toBe(false);
      const offers = await other.c.get(`/animal-support/needs/${needId}/offers`);
      expect([403, 404]).toContain(offers.status);
    });
  });

  // ------------------------------------------------------------------ 6A lost pet

  describe("lost pet lifecycle, sharing and operations", () => {
    it("reunion can be recorded directly, returns the pet to ACTIVE, and the shared link shows the happy outcome without accepting sightings", async () => {
      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost", publicArea: "Vanak" }).expect(201);
      const id = incident.body.id as string;
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: o.petId } })).lifecycleStatus).toBe("LOST");
      await o.c.post(`/pets/${o.petId}/lost-incidents/${id}/reunite`).expect(201);
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: o.petId } })).lifecycleStatus).toBe("ACTIVE");
      const pub = await request(server).get(`/lost-pets/${id}`).expect(200);
      expect(pub.body.status).toBe("REUNITED");
      const list = await request(server).get("/lost-pets?pageSize=48").expect(200);
      expect(list.body.items.some((i: { id: string }) => i.id === id)).toBe(false);
      const primed = await request(server).get("/health/live");
      const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
      await request(server).post(`/lost-pets/${id}/sightings`).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ seenAt: new Date().toISOString() }).expect(404);
      await request(server).post(`/lost-pets/${id}/sightings/upload-url`).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ contentType: "image/jpeg", fileSizeBytes: 1000 }).expect(404);
      await request(server).get("/lost-pets/not-a-uuid").expect(400);
    });

    it("a sighting notifies the household with an exact deep link, and the reporter stays private", async () => {
      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost", publicArea: "Tajrish" }).expect(201);
      const reporter = await user("b6-reporter");
      await reporter.c.post(`/lost-pets/${incident.body.id}/sightings`).send({ seenAt: new Date().toISOString(), location: "Tajrish bazaar entrance", description: "Brown dog, red collar" }).expect(201);
      const sightings = await o.c.get(`/pets/${o.petId}/lost-incidents/${incident.body.id}/sightings`).expect(200);
      expect(sightings.body).toHaveLength(1);
      expect(JSON.stringify(sightings.body)).not.toContain(reporter.email);
      const deadline = Date.now() + 5000;
      let notification = null;
      while (!notification && Date.now() < deadline) {
        notification = await prisma.notification.findFirst({ where: { userId: o.userId, type: "lost_pet.sighting_submitted" } });
        if (!notification) await new Promise((r) => setTimeout(r, 100));
      }
      expect(notification?.deepLink).toBe(`/pets/${o.petId}/lost/${incident.body.id}`);
    });

    it("admin operations mask the exact location, reveal it only with PII permission and audit every reveal and moderator close", async () => {
      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost", publicArea: "Gisha", lastKnownLocation: "Gisha st, No. 3", lastKnownLatitude: EXACT_LAT, lastKnownLongitude: EXACT_LNG, privateNotes: "chip 123" }).expect(201);
      const id = incident.body.id as string;
      const content = await admin(AdminRole.CONTENT);
      const detail = await content.c.get(`/admin/lost-pets/${id}`).expect(200);
      expect(leaksExactCoordinates(detail.body)).toBe(false);
      expect(JSON.stringify(detail.body)).not.toContain("No. 3");
      expect(detail.body.exactLocationRecorded).toBe(true);
      await content.c.post(`/admin/lost-pets/${id}/reveal-location`).send({ reason: "Checking a report" }).expect(403);
      const ts = await admin(AdminRole.TRUST_SAFETY);
      await ts.c.post(`/admin/lost-pets/${id}/reveal-location`).send({}).expect(400);
      const revealed = await ts.c.post(`/admin/lost-pets/${id}/reveal-location`).send({ reason: "Owner asked support for help" }).expect(200);
      expect(revealed.body.lastKnownLatitude).toBe(EXACT_LAT);
      const editor = await admin(AdminRole.EDITOR);
      await editor.c.get(`/admin/lost-pets/${id}`).expect(403);
      await ts.c.post(`/admin/lost-pets/${id}/close`).send({ reason: "Duplicate of another report" }).expect(200);
      const audit = await prisma.adminAuditLog.findMany({ where: { entityType: "LOST_PET_INCIDENT", entityId: id }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => a.action)).toEqual(["lost_pet_incident.location_revealed", "lost_pet_incident.closed_by_moderator"]);
      await request(server).get(`/lost-pets/${id}`).expect(404);
      // A moderator never changes the pet's lifecycle.
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: o.petId } })).lifecycleStatus).toBe("LOST");
    });
  });

  // ------------------------------------------------------------------ 6B animal support

  describe("animal support needs and help offers", () => {
    async function waitForNotification(userId: string, type: string) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const n = await prisma.notification.findFirst({ where: { userId, type } });
        if (n) return n;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }

    it("offer → accept → in progress → partial completion → pause/resume → full completion, with honest states and notifications", async () => {
      const publisher = await user("b6-publisher");
      const helperA = await user("b6-helper");
      const helperB = await user("b6-helper");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(publisher.c, mod.c);
      expect((await waitForNotification(publisher.userId, "animal_support.listing_published"))?.deepLink).toBe(`/animal-support/needs/${needId}/manage`);

      await publisher.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "I can bring food myself", helpType: "FOOD", quantity: 2 }).expect(403);
      const offerA = await helperA.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "I can bring three bags", helpType: "FOOD", quantity: 3, timing: "Friday morning" }).expect(201);
      expect(offerA.body.timing).toBe("Friday morning");
      await helperA.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Another offer from me", helpType: "FOOD", quantity: 1 }).expect(409);
      expect((await waitForNotification(publisher.userId, "animal_support.offer_received"))?.deepLink).toBe(`/animal-support/needs/${needId}/manage`);

      // Only the publisher can accept; the helper cannot accept their own offer; strangers cannot touch it.
      await helperA.c.patch(`/animal-support/needs/${needId}/offers/${offerA.body.id}`).send({ status: "ACCEPTED" }).expect(403);
      await helperB.c.patch(`/animal-support/needs/${needId}/offers/${offerA.body.id}`).send({ status: "CANCELLED" }).expect(403);
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${offerA.body.id}`).send({ status: "ACCEPTED" }).expect(200);
      expect((await waitForNotification(helperA.userId, "animal_support.offer_accepted"))?.deepLink).toBe("/animal-support/my-help");
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${offerA.body.id}`).send({ status: "IN_PROGRESS" }).expect(200);
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${offerA.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 3 }).expect(200);

      let listing = await request(server).get(`/animal-support/needs/${needId}`).expect(200);
      expect(listing.body.status).toBe("PARTIALLY_FULFILLED");
      expect(listing.body.fulfilledQuantity).toBe(3);
      const summary = await request(server).get(`/animal-support/needs/${needId}/summary`).expect(200);
      expect(summary.body).toMatchObject({ neededQuantity: 10, fulfilledQuantity: 3, completedOffers: 1 });
      expect(JSON.stringify(summary.body)).not.toContain(helperA.userId);

      // Pause: link still works, not listed, no new offers; resume keeps the progress.
      await publisher.c.post(`/animal-support/needs/${needId}/pause`).expect(201);
      expect((await request(server).get(`/animal-support/needs/${needId}`).expect(200)).body.status).toBe("PAUSED");
      expect((await request(server).get("/animal-support/needs?pageSize=100").expect(200)).body.items.some((i: { id: string }) => i.id === needId)).toBe(false);
      await helperB.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Seven bags from our store", helpType: "FOOD", quantity: 7 }).expect(409);
      await publisher.c.post(`/animal-support/needs/${needId}/resume`).expect(201);
      expect((await request(server).get(`/animal-support/needs/${needId}`).expect(200)).body.status).toBe("PARTIALLY_FULFILLED");

      const offerB = await helperB.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Seven bags from our store", helpType: "FOOD", quantity: 7 }).expect(201);
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${offerB.body.id}`).send({ status: "ACCEPTED" }).expect(200);
      // Progress is clamped to the need.
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${offerB.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 9 }).expect(200);
      listing = await request(server).get(`/animal-support/needs/${needId}`).expect(200);
      expect(listing.body.status).toBe("FULFILLED");
      expect(listing.body.fulfilledQuantity).toBe(10);
      expect(listing.body.fulfilledAt).toBeTruthy();
      const helperC = await user("b6-helper");
      await helperC.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Can I still help?", helpType: "FOOD", quantity: 1 }).expect(409);
      const resolved = await request(server).get("/animal-support/needs?state=RESOLVED&pageSize=100").expect(200);
      expect(resolved.body.items.some((i: { id: string }) => i.id === needId)).toBe(true);
      expect((await waitForNotification(publisher.userId, "animal_support.fulfilled"))).toBeTruthy();
    });

    it("decline and helper cancellation, and a helper sees only their own offers", async () => {
      const publisher = await user("b6-publisher");
      const helper = await user("b6-helper");
      const other = await user("b6-helper");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(publisher.c, mod.c, { category: "TRANSPORT", neededQuantity: null, quantityUnit: null });
      const a = await helper.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "I can drive to the vet", helpType: "TRANSPORT" }).expect(201);
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${a.body.id}`).send({ status: "DECLINED" }).expect(200);
      expect(await waitForNotification(helper.userId, "animal_support.offer_declined")).toBeTruthy();
      await publisher.c.patch(`/animal-support/needs/${needId}/offers/${a.body.id}`).send({ status: "ACCEPTED" }).expect(409);
      const b = await other.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Weekend driving", helpType: "TRANSPORT" }).expect(201);
      await other.c.patch(`/animal-support/needs/${needId}/offers/${b.body.id}`).send({ status: "CANCELLED" }).expect(200);
      expect(await waitForNotification(publisher.userId, "animal_support.offer_cancelled")).toBeTruthy();
      const mine = await helper.c.get("/animal-support/needs/mine/offers").expect(200);
      expect(mine.body.map((o: { id: string }) => o.id)).toEqual([a.body.id]);
      await helper.c.patch(`/animal-support/needs/${needId}/offers/not-a-uuid`).send({ status: "CANCELLED" }).expect(400);
    });

    it("deadlines: validated, expire the listing (history kept) and remind the publisher once", async () => {
      const publisher = await user("b6-publisher");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      await publisher.c.post("/animal-support/needs").send({ title: "Past deadline", description: "Should be refused as the deadline is in the past.", category: "FOOD", province: "تهران", city: "تهران", expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(400);
      await publisher.c.post("/animal-support/needs").send({ title: "Far deadline", description: "Should be refused as the deadline is too far away.", category: "FOOD", province: "تهران", city: "تهران", expiresAt: new Date(Date.now() + 400 * 86_400_000).toISOString() }).expect(400);
      const soonId = await publishedNeed(publisher.c, mod.c, { expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
      const pastId = await publishedNeed(publisher.c, mod.c, { expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
      await prisma.supportNeedListing.update({ where: { id: pastId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const { SupportNeedService } = await import("../src/modules/animal-support/support-need.service");
      const svc = app.get(SupportNeedService);
      const first = await svc.processExpiries();
      expect(first.expired).toBeGreaterThanOrEqual(1);
      expect(first.warned).toBeGreaterThanOrEqual(1);
      await svc.processExpiries();
      expect(await prisma.notification.count({ where: { userId: publisher.userId, type: "animal_support.expiring_soon", entityId: soonId } })).toBe(1);
      const expired = await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: pastId } });
      expect(expired.status).toBe("EXPIRED");
      await request(server).get(`/animal-support/needs/${pastId}`).expect(404);
      expect((await publisher.c.get(`/animal-support/needs/${pastId}/manage`).expect(200)).body.status).toBe("EXPIRED");
    });

    it("discovery sorts only by explicit data and filters by category and city", async () => {
      const publisher = await user("b6-publisher");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const city = `Rasht-${unique()}`;
      const later = await publishedNeed(publisher.c, mod.c, { city, urgency: "NORMAL", expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString() });
      const sooner = await publishedNeed(publisher.c, mod.c, { city, urgency: "CRITICAL", category: "VETERINARY_CARE", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      const byUrgency = await request(server).get(`/animal-support/needs?city=${encodeURIComponent(city)}`).expect(200);
      expect(byUrgency.body.items.map((i: { id: string }) => i.id)).toEqual([sooner, later]);
      const closing = await request(server).get(`/animal-support/needs?city=${encodeURIComponent(city)}&sort=CLOSING_SOON`).expect(200);
      expect(closing.body.items.map((i: { id: string }) => i.id)).toEqual([sooner, later]);
      const recent = await request(server).get(`/animal-support/needs?city=${encodeURIComponent(city)}&sort=RECENT`).expect(200);
      expect(recent.body.items.map((i: { id: string }) => i.id)).toEqual([sooner, later]);
      const vet = await request(server).get(`/animal-support/needs?city=${encodeURIComponent(city)}&category=VETERINARY_CARE`).expect(200);
      expect(vet.body.items.map((i: { id: string }) => i.id)).toEqual([sooner]);
      await request(server).get(`/animal-support/needs?sort=NEAREST`).expect(400);
    });
  });

  // ------------------------------------------------------------------ 6C donations

  describe("donations", () => {
    async function orgWithCampaign(fundType: "GENERAL" | "RESTRICTED", targetAmountIrr = 50_000_000) {
      const ops = await admin(AdminRole.ADMIN);
      const org = await ops.c.post("/admin/animal-support/organizations").send({ type: "NGO", name: `Rescue ${unique()}` }).expect(201);
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/verification`).send({ verificationStatus: "VERIFIED" }).expect(201);
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/listing`).send({ isPubliclyListed: true }).expect(201);
      const campaign = await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/campaigns`).send({ title: `Winter food ${unique()}`, description: "Food for the winter", fundType, targetAmountIrr }).expect(201);
      await ops.c.patch(`/admin/animal-support/campaigns/${campaign.body.id}/status`).send({ status: "ACTIVE" }).expect(200);
      return { ops, organizationId: org.body.id as string, campaignId: campaign.body.id as string };
    }

    async function netByAccount(referenceIds: string[]) {
      const entries = await prisma.ledgerEntry.findMany({ where: { ledgerTransaction: { referenceId: { in: referenceIds } } }, include: { ledgerAccount: true } });
      const net: Record<string, number> = {};
      for (const e of entries) net[e.ledgerAccount.code] = (net[e.ledgerAccount.code] ?? 0) + (e.direction === "DEBIT" ? e.amount : -e.amount);
      return net;
    }

    it("a sandbox donation records both ledger legs, shows real progress, and gives the donor a private receipt", async () => {
      const { campaignId, organizationId } = await orgWithCampaign("GENERAL");
      const donor = await user("b6-donor");
      const res = await donor.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 2_000_000, idempotencyKey: `k-${unique()}` }).expect(201);
      expect(res.body.status).toBe("SUCCEEDED");
      const intent = await prisma.donationIntent.findUniqueOrThrow({ where: { id: res.body.donationIntentId } });
      const net = await netByAccount([intent.checkoutId, intent.id]);
      expect(net.CASH_GATEWAY_RECEIVABLE).toBe(2_000_000);
      expect(net.DONATION_PAYABLE).toBe(-2_000_000);
      expect(net.CUSTOMER_PAYMENT_CLEARING ?? 0).toBe(0);
      const campaign = await request(server).get(`/animal-support/campaigns/${campaignId}`).expect(200);
      expect(campaign.body.raisedAmountIrr).toBe(2_000_000);
      const receipt = await donor.c.get(`/me/donations/${intent.id}`).expect(200);
      expect(receipt.body).toMatchObject({ status: "SUCCEEDED", amountIrr: 2_000_000, fundType: "GENERAL", organization: { id: organizationId } });
      const stranger = await user("b6-stranger");
      await stranger.c.get(`/me/donations/${intent.id}`).expect(404);
      const env = await request(server).get("/payments/environment").expect(200);
      expect(env.body).toEqual({ mode: "sandbox", onlinePaymentAvailable: true });
    });

    it("public donors show only a name the donor chose, never the account name; anonymous by default", async () => {
      const { campaignId } = await orgWithCampaign("GENERAL");
      const named = await user("b6-donor");
      await prisma.user.update({ where: { id: named.userId }, data: { displayName: "Parisa Amini Legal-Name" } });
      await named.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 1_000_000, showDonorPublicly: true }).expect(400);
      await named.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 1_000_000, showDonorPublicly: true, publicDisplayName: "A friend of the shelter" }).expect(201);
      const anonymous = await user("b6-donor");
      await anonymous.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 1_500_000 }).expect(201);
      const donors = await request(server).get(`/animal-support/campaigns/${campaignId}/donors`).expect(200);
      const json = JSON.stringify(donors.body);
      expect(json).toContain("A friend of the shelter");
      expect(json).not.toContain("Legal-Name");
      expect(json).not.toContain(named.email);
      expect(json).not.toContain(named.userId);
      expect(donors.body).toHaveLength(1);
    });

    it("idempotency: repeats and concurrent retries never charge twice, and a key cannot be reused for another campaign", async () => {
      const { campaignId } = await orgWithCampaign("GENERAL");
      const other = await orgWithCampaign("GENERAL");
      const donor = await user("b6-donor");
      const key = `idem-${unique()}`;
      const results = await Promise.all([1, 2, 3].map(() => donor.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 3_000_000, idempotencyKey: key })));
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.donationIntentId)).size).toBe(1);
      expect(await prisma.donationIntent.count({ where: { idempotencyKey: key } })).toBe(1);
      expect((await request(server).get(`/animal-support/campaigns/${campaignId}`).expect(200)).body.raisedAmountIrr).toBe(3_000_000);
      await donor.c.post(`/animal-support/campaigns/${other.campaignId}/donate`).send({ amountIrr: 3_000_000, idempotencyKey: key }).expect(400);
      await donor.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 500 }).expect(400);
    });

    it("restricted donations stay linked to the need's own campaign", async () => {
      const { campaignId, ops, organizationId } = await orgWithCampaign("RESTRICTED");
      const unrelated = await orgWithCampaign("RESTRICTED");
      const publisher = await user("b6-publisher");
      await prisma.animalSupportOrgMembership.create({ data: { organizationId, userId: publisher.userId, role: "COORDINATOR" } });
      const needId = await publishedNeed(publisher.c, ops.c, { category: "VETERINARY_CARE", campaignId, organizationId, contactMode: "BOTH" });
      const donor = await user("b6-donor");
      await donor.c.post(`/animal-support/campaigns/${unrelated.campaignId}/donate`).send({ amountIrr: 1_000_000, supportNeedListingId: needId }).expect(400);
      const ok = await donor.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 1_000_000, supportNeedListingId: needId }).expect(201);
      const receipt = await donor.c.get(`/me/donations/${ok.body.donationIntentId}`).expect(200);
      expect(receipt.body.fundType).toBe("RESTRICTED");
      expect(receipt.body.supportNeed.id).toBe(needId);
    });

    it("refunds go through the gateway, reverse both legs, can't happen twice, and only finance may do them", async () => {
      const { campaignId, organizationId } = await orgWithCampaign("GENERAL");
      const donor = await user("b6-donor");
      const res = await donor.c.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 4_000_000 }).expect(201);
      const id = res.body.donationIntentId as string;
      const ts = await admin(AdminRole.TRUST_SAFETY);
      await ts.c.post(`/admin/animal-support/donations/${id}/refund`).send({ reason: "Donor asked" }).expect(403);
      const finance = await admin(AdminRole.FINANCE);
      await finance.c.post(`/admin/animal-support/donations/${id}/refund`).send({ reason: "Donor asked within 24h" }).expect(201);
      const intent = await prisma.donationIntent.findUniqueOrThrow({ where: { id } });
      expect(intent.status).toBe("REFUNDED");
      const refund = await prisma.refund.findFirstOrThrow({ where: { paymentIntent: { checkoutId: intent.checkoutId } } });
      expect(refund.status).toBe("SUCCEEDED");
      expect(refund.providerReference).toBeTruthy();
      expect(refund.requestedByAdminUserId).toBeTruthy();
      const net = await netByAccount([intent.checkoutId, intent.id, refund.id]);
      expect(net.CASH_GATEWAY_RECEIVABLE ?? 0).toBe(0);
      expect(net.DONATION_PAYABLE ?? 0).toBe(0);
      expect(net.CUSTOMER_PAYMENT_CLEARING ?? 0).toBe(0);
      expect((await request(server).get(`/animal-support/campaigns/${campaignId}`).expect(200)).body.raisedAmountIrr).toBe(0);
      const second = await finance.c.post(`/admin/animal-support/donations/${id}/refund`).send({ reason: "Again" });
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(await prisma.refund.count({ where: { paymentIntent: { checkoutId: intent.checkoutId }, status: "SUCCEEDED" } })).toBe(1);
      expect((await donor.c.get(`/me/donations/${id}`).expect(200)).body.status).toBe("REFUNDED");
      expect(await prisma.adminAuditLog.count({ where: { entityType: "DonationIntent", entityId: id, action: "donation.refunded" } })).toBe(1);
      void organizationId;
    });
  });

  // ------------------------------------------------------------------ 6D NGO operations

  describe("NGO / shelter operations", () => {
    async function ngo(name = `Shelter ${unique()}`) {
      const ops = await admin(AdminRole.ADMIN);
      const org = await ops.c.post("/admin/animal-support/organizations").send({ type: "SHELTER", name }).expect(201);
      const owner = await user("b6-ngo-owner");
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/members`).send({ email: owner.email, role: "OWNER" }).expect(201);
      return { ops, owner, organizationId: org.body.id as string };
    }

    it("nobody can publish in an organization's name, or link its campaign, without being its staff", async () => {
      const a = await ngo();
      const stranger = await user("b6-stranger");
      await stranger.c.post("/animal-support/needs").send({ title: "Fake shelter need", description: "Pretending to be a verified shelter to collect help.", category: "FOOD", province: "تهران", city: "تهران", organizationId: a.organizationId }).expect(403);
      const campaign = await a.ops.c.post(`/admin/animal-support/organizations/${a.organizationId}/campaigns`).send({ title: "Real campaign", description: "Real", fundType: "GENERAL" }).expect(201);
      await stranger.c.post("/animal-support/needs").send({ title: "Redirecting donations", description: "Points the donate button at someone else's campaign.", category: "FOOD", province: "تهران", city: "تهران", campaignId: campaign.body.id }).expect(403);
      const ok = await a.owner.c.post("/animal-support/needs").send({ title: "Blankets for winter", description: "Twenty blankets for the dog shelter this winter.", category: "SHELTER_SUPPLIES", province: "البرز", city: "کرج", organizationId: a.organizationId, campaignId: campaign.body.id, neededQuantity: 20 }).expect(201);
      expect(ok.body.organizationId).toBe(a.organizationId);
    });

    it("a coordinator (not the creator) manages the organization's listing and offers; other organizations see nothing", async () => {
      const a = await ngo();
      const b = await ngo();
      const coordinator = await user("b6-coordinator");
      await a.owner.c.post("/ngo/team").send({ email: coordinator.email, role: "COORDINATOR" }).expect(201);
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const needId = await publishedNeed(a.owner.c, mod.c, { organizationId: a.organizationId });
      const helper = await user("b6-helper");
      const offer = await helper.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Two bags from me", helpType: "FOOD", quantity: 2 }).expect(201);
      // Staff cannot offer help on their own organization's need.
      await coordinator.c.post(`/animal-support/needs/${needId}/offers`).send({ message: "Staff offering to self", helpType: "FOOD" }).expect(403);
      await coordinator.c.patch(`/animal-support/needs/${needId}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
      expect((await coordinator.c.get(`/animal-support/needs/${needId}/manage`).expect(200)).body.id).toBe(needId);
      const offers = await coordinator.c.get("/ngo/offers").expect(200);
      expect(offers.body.items.map((o: { id: string }) => o.id)).toContain(offer.body.id);
      expect(JSON.stringify(offers.body)).not.toContain(helper.email);

      // Organization B's owner: no access to A's listing, offers, donations or team — even by selecting A.
      await b.owner.c.get(`/animal-support/needs/${needId}/manage`).expect(403);
      await b.owner.c.patch(`/animal-support/needs/${needId}/offers/${offer.body.id}`).send({ status: "DECLINED" }).expect(403);
      expect((await b.owner.c.get("/ngo/offers").expect(200)).body.items).toHaveLength(0);
      expect((await b.owner.c.get("/ngo/needs").expect(200)).body.items).toHaveLength(0);
      await b.owner.c.get(`/ngo/donations?org=${a.organizationId}`).expect(403);
      await request(server).get("/ngo/team").set("Cookie", "").expect(401);
      const bTeam = await b.owner.c.get("/ngo/team").expect(200);
      expect(JSON.stringify(bTeam.body)).not.toContain(coordinator.userId);
      const notified = await prisma.notification.findFirst({ where: { userId: coordinator.userId, type: "animal_support.offer_received" } });
      expect(notified?.deepLink).toBe(`/animal-support/needs/${needId}/manage`);
    });

    it("roles: viewers read only, only owners manage the team, and the last owner cannot be removed", async () => {
      const a = await ngo();
      const viewer = await user("b6-viewer");
      await a.owner.c.post("/ngo/team").send({ email: viewer.email, role: "VIEWER" }).expect(201);
      expect((await viewer.c.get("/ngo/overview").expect(200)).body.role).toBe("VIEWER");
      await viewer.c.post("/ngo/team").send({ email: viewer.email, role: "OWNER" }).expect(403);
      await viewer.c.patch("/ngo/profile").send({ description: "hijack" }).expect(403);
      await viewer.c.post("/animal-support/needs").send({ title: "Viewer listing", description: "Viewers must not publish for the organization.", category: "FOOD", province: "تهران", city: "تهران", organizationId: a.organizationId }).expect(403);
      const team = await a.owner.c.get("/ngo/team").expect(200);
      const ownerRow = team.body.find((m: { role: string }) => m.role === "OWNER");
      await a.owner.c.patch(`/ngo/team/${ownerRow.id}`).send({ role: "VIEWER" }).expect(400);
      const nobody = await user("b6-nobody");
      await nobody.c.get("/ngo/overview").expect(403);
    });

    it("the portal shows ledger-derived donations without donor identity, and verification is submitted with private documents", async () => {
      const a = await ngo();
      const campaign = await a.ops.c.post(`/admin/animal-support/organizations/${a.organizationId}/campaigns`).send({ title: "Surgery fund", description: "For surgeries", fundType: "RESTRICTED" }).expect(201);
      await a.ops.c.post(`/admin/animal-support/organizations/${a.organizationId}/verification`).send({ verificationStatus: "VERIFIED" }).expect(201);
      await a.ops.c.post(`/admin/animal-support/organizations/${a.organizationId}/listing`).send({ isPubliclyListed: true }).expect(201);
      await a.ops.c.patch(`/admin/animal-support/campaigns/${campaign.body.id}/status`).send({ status: "ACTIVE" }).expect(200);
      const donor = await user("b6-donor");
      await donor.c.post(`/animal-support/campaigns/${campaign.body.id}/donate`).send({ amountIrr: 7_000_000 }).expect(201);
      const donations = await a.owner.c.get("/ngo/donations").expect(200);
      expect(donations.body.balance.restrictedAvailableIrr).toBe(7_000_000);
      expect(donations.body.items[0]).toMatchObject({ amountIrr: 7_000_000, fundType: "RESTRICTED", donorName: null });
      expect(JSON.stringify(donations.body)).not.toContain(donor.userId);
      expect(JSON.stringify(donations.body)).not.toContain(donor.email);
      const overview = await a.owner.c.get("/ngo/overview").expect(200);
      expect(overview.body.donations.receivedLast30DaysIrr).toBe(7_000_000);
      expect(await prisma.notification.count({ where: { userId: a.owner.userId, type: "animal_support.org_donation_received" } })).toBe(1);

      // Verification: a second organization submits documents it uploaded; forged keys are refused.
      const b = await ngo();
      await b.owner.c.post("/ngo/verification/submit").send({ documentKeys: [`animal-support-verification/${a.organizationId}/x.pdf`] }).expect(400);
      const upload = await b.owner.c.post("/ngo/verification/upload-url").send({ contentType: "application/pdf", fileSizeBytes: 20_000 }).expect(201);
      expect(upload.body.key).toContain(`animal-support-verification/${b.organizationId}/`);
      const submitted = await b.owner.c.post("/ngo/verification/submit").send({ documentKeys: [upload.body.key] }).expect(201);
      expect(submitted.body.status).toBe("SUBMITTED");
      await b.owner.c.post("/ngo/verification/submit").send({ documentKeys: [upload.body.key] }).expect(400);
      // Documents are never in any public response.
      expect(JSON.stringify((await request(server).get(`/animal-support/organizations?pageSize=100`)).body)).not.toContain("animal-support-verification");
      await a.ops.c.post(`/admin/animal-support/organizations/${b.organizationId}/verification`).send({ verificationStatus: "NEEDS_INFORMATION", reason: "Please add the registration certificate." }).expect(201);
      const status = await b.owner.c.get("/ngo/verification").expect(200);
      expect(status.body).toMatchObject({ status: "NEEDS_INFORMATION", note: "Please add the registration certificate.", canSubmit: true, documentCount: 1 });
      expect((await prisma.notification.findFirst({ where: { userId: b.owner.userId, type: "ngo.verification_updated" } }))?.deepLink).toBe("/ngo/verification");
      const docs = await a.ops.c.post(`/admin/animal-support/organizations/${b.organizationId}/verification-documents`).send({ reason: "Reviewing the submission" }).expect(200);
      expect(docs.body).toHaveLength(1);
      expect(await prisma.adminAuditLog.count({ where: { entityId: b.organizationId, action: "animal_support_organization.verification_documents_opened" } })).toBe(1);
      const content = await admin(AdminRole.CONTENT);
      await content.c.post(`/admin/animal-support/organizations/${b.organizationId}/verification-documents`).send({ reason: "Curious" }).expect(403);
    });
  });

  // ------------------------------------------------------------------ 6E community + reports

  describe("community privacy and reports", () => {
    it("public community content shows only a first name, hides author ids and pet ids, and supports search", async () => {
      const author = await owner("Pishi");
      await prisma.user.update({ where: { id: author.userId }, data: { displayName: "Sara Rezaei Full-Name" } });
      const marker = `glowcollar${unique().replace(/[^a-z0-9]/g, "")}`;
      const created = await author.c.post("/community/posts").send({ type: "GENERAL", title: `Night walks ${marker}`, body: "Which reflective collar do you use?", petId: author.petId }).expect(201);
      expect(created.body).toMatchObject({ isMine: true, authorUserId: author.userId, authorDisplayName: "Sara" });
      await author.c.post(`/community/posts/${created.body.id}/comments`).send({ body: "Following!" }).expect(201);

      const anon = await request(server).get(`/community/posts/${created.body.id}`).expect(200);
      expect(anon.body).toMatchObject({ isMine: false, authorUserId: null, authorDisplayName: "Sara" });
      const serialized = JSON.stringify(anon.body);
      expect(serialized).not.toContain(author.userId);
      expect(serialized).not.toContain(author.petId);
      expect(serialized).not.toContain("Rezaei");
      const comments = await request(server).get(`/community/posts/${created.body.id}/comments`).expect(200);
      expect(comments.body.items[0]).toMatchObject({ authorUserId: null, isMine: false, authorDisplayName: "Sara" });
      expect((await author.c.get(`/community/posts/${created.body.id}/comments`).expect(200)).body.items[0].isMine).toBe(true);

      const found = await request(server).get(`/community/posts?q=${marker}`).expect(200);
      expect(found.body.items.map((i: { id: string }) => i.id)).toEqual([created.body.id]);
      expect((await request(server).get(`/community/posts?q=${marker}zzz`).expect(200)).body.items).toHaveLength(0);
    });

    it("a reporter cannot pile up duplicate open reports, and reports on every surface land in the one moderation queue", async () => {
      const author = await user("b6-author");
      const reporter = await user("b6-reporter");
      const post = await author.c.post("/community/posts").send({ type: "GENERAL", body: "Selling puppies, DM me for cheap prices" }).expect(201);
      const first = await reporter.c.post(`/community/posts/${post.body.id}/report`).send({ reason: "SCAM", details: "Asks for a deposit" }).expect(201);
      const dup = await reporter.c.post(`/community/posts/${post.body.id}/report`).send({ reason: "SPAM" }).expect(409);
      expect(dup.body.error.code).toBe("DUPLICATE_REPORT");
      // Someone else can still report the same post.
      const second = await (await user("b6-reporter2")).c.post(`/community/posts/${post.body.id}/report`).send({ reason: "ANIMAL_WELFARE" }).expect(201);

      const mod = await admin(AdminRole.TRUST_SAFETY);
      const e1 = await mod.c.post(`/admin/community/reports/${first.body.id}/escalate`).send({ reason: "Likely puppy scam" }).expect(201);
      const e2 = await mod.c.post(`/admin/community/reports/${second.body.id}/escalate`).send({ reason: "Same post" }).expect(201);
      expect(e2.body.trustCaseId).toBe(e1.body.trustCaseId);
      await mod.c.post(`/admin/community/reports/${first.body.id}/escalate`).send({ reason: "again" }).expect(409);
      // While the escalated case is under review the reporter still cannot re-file; after a dismissal they can.
      await reporter.c.post(`/community/posts/${post.body.id}/report`).send({ reason: "SPAM" }).expect(409);
      const other = await author.c.post("/community/posts").send({ type: "GENERAL", body: "Harmless post" }).expect(201);
      const mistaken = await reporter.c.post(`/community/posts/${other.body.id}/report`).send({ reason: "SPAM" }).expect(201);
      await mod.c.post(`/admin/community/reports/${mistaken.body.id}/dismiss`).send({ reason: "Not spam" }).expect(201);
      await reporter.c.post(`/community/posts/${other.body.id}/report`).send({ reason: "HARASSMENT" }).expect(201);

      // Support needs, lost-pet incidents and organizations go through POST /reports into the same queue.
      const needId = await publishedNeed(author.c, mod.c);
      const needReport = await reporter.c.post("/reports").send({ targetType: "SUPPORT_NEED", targetId: needId, reason: "SCAM" }).expect(201);
      expect(needReport.body.supportNeedListingId).toBe(needId);
      await reporter.c.post("/reports").send({ targetType: "SUPPORT_NEED", targetId: needId, reason: "SPAM" }).expect(409);
      const escalatedNeed = await mod.c.post(`/admin/community/reports/${needReport.body.id}/escalate`).send({ reason: "Suspicious fundraising" }).expect(201);
      expect((await prisma.trustCase.findUniqueOrThrow({ where: { id: escalatedNeed.body.trustCaseId } })).subjectType).toBe("SUPPORT_NEED");

      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost near the bazaar", publicArea: "Tajrish", contactPreference: "IN_APP_MESSAGE" }).expect(201);
      await reporter.c.post("/reports").send({ targetType: "LOST_PET_INCIDENT", targetId: incident.body.id, reason: "MISINFORMATION" }).expect(201);

      const orgRow = await prisma.animalSupportOrganization.create({ data: { type: "SHELTER", name: `Shelter ${unique()}`, isPubliclyListed: true, verificationStatus: "VERIFIED" } });
      await reporter.c.post("/reports").send({ targetType: "ORGANIZATION", targetId: orgRow.id, reason: "SCAM" }).expect(201);

      const queue = await mod.c.get("/admin/community/reports?targetType=SUPPORT_NEED&pageSize=100").expect(200);
      expect(queue.body.items.every((r: { supportNeedListingId: string | null }) => r.supportNeedListingId)).toBe(true);
      expect(queue.body.items.some((r: { id: string }) => r.id === needReport.body.id)).toBe(true);

      // Anonymous users cannot report; unknown or hidden targets look like not-found.
      await request(server).post("/reports").send({ targetType: "SUPPORT_NEED", targetId: needId, reason: "SCAM" }).expect(403);
      await reporter.c.post("/reports").send({ targetType: "SUPPORT_NEED", targetId: "00000000-0000-4000-8000-000000000000", reason: "SCAM" }).expect(404);
      await reporter.c.post("/reports").send({ targetType: "SUPPORT_NEED", targetId: needId, reason: "NOT_A_REASON" }).expect(400);
    });

    it("sightings are private — only the incident's household can report one", async () => {
      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost near the park", publicArea: "Vanak", contactPreference: "IN_APP_MESSAGE" }).expect(201);
      const primed = await request(server).get("/health/live");
      const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
      const sighting = await request(server).post(`/lost-pets/${incident.body.id}/sightings`).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ seenAt: new Date().toISOString(), description: "Send me money and I'll return him" }).expect(201);
      const stranger = await user("b6-stranger");
      await stranger.c.post("/reports").send({ targetType: "LOST_PET_SIGHTING", targetId: sighting.body.id, reason: "SCAM" }).expect(404);
      const r = await o.c.post("/reports").send({ targetType: "LOST_PET_SIGHTING", targetId: sighting.body.id, reason: "SCAM" }).expect(201);
      expect(r.body.lostPetSightingId).toBe(sighting.body.id);
    });
  });


  // ------------------------------------------------------------------ 6F trust & safety

  describe("trust & safety enforcement", () => {
    async function caseFor(mod: Client, reporter: Client, targetType: string, targetId: string) {
      const report = await reporter.post("/reports").send({ targetType, targetId, reason: "SCAM", details: "Asked for card-to-card payment" }).expect(201);
      const escalated = await mod.post(`/admin/community/reports/${report.body.id}/escalate`).send({ reason: "Possible fraud" }).expect(201);
      return { reportId: report.body.id as string, caseId: escalated.body.trustCaseId as string };
    }

    it("removing a support listing hides it, resolves the reports, tells the publisher, and RESTORE returns its exact prior state", async () => {
      const publisher = await user("b6-publisher");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const reporter = await user("b6-reporter");
      const needId = await publishedNeed(publisher.c, mod.c);
      // Some help already arrived, so the listing is PARTIALLY_FULFILLED — restore must bring back exactly that.
      await prisma.supportNeedListing.update({ where: { id: needId }, data: { status: "PARTIALLY_FULFILLED" } });
      const { reportId, caseId } = await caseFor(mod.c, reporter.c, "SUPPORT_NEED", needId);

      const context = await mod.c.get(`/admin/trust/cases/${caseId}/context`).expect(200);
      expect(context.body.subject).toMatchObject({ kind: "SUPPORT_NEED", status: "PARTIALLY_FULFILLED" });
      expect(context.body.reports).toMatchObject({ total: 1, distinctReporters: 1, byReason: { SCAM: 1 } });
      expect(context.body.availableActions).toEqual(expect.arrayContaining(["REMOVE_CONTENT", "RESTRICT", "RESTORE"]));
      expect(JSON.stringify(context.body)).not.toContain(reporter.userId);
      expect(leaksExactCoordinates(context.body)).toBe(false);

      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "Fraudulent fundraising" }).expect(201);
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: needId } })).status).toBe("REMOVED");
      await request(server).get(`/animal-support/needs/${needId}`).expect(404);
      expect((await prisma.communityReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("RESOLVED");
      await eventually(async () => (await prisma.notification.count({ where: { userId: publisher.userId, type: "animal_support.listing_removed" } })) === 1);

      // A second removal is refused (nothing to change), restore brings back PARTIALLY_FULFILLED, and a second restore is refused.
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "again" }).expect(409);
      const restored = await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "Publisher proved the need is genuine" }).expect(201);
      expect(restored.body.effectSummary).toMatchObject({ before: { status: "REMOVED" }, after: { status: "PARTIALLY_FULFILLED" } });
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: needId } })).status).toBe("PARTIALLY_FULFILLED");
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "twice" }).expect(409);

      // History is preserved: the removal and the restore are both on the case, and both audited.
      const full = await mod.c.get(`/admin/trust/cases/${caseId}`).expect(200);
      expect(full.body.actions.map((a: { actionType: string }) => a.actionType).sort()).toEqual(["REMOVE_CONTENT", "RESTORE"]);
      expect(full.body.actions.find((a: { actionType: string }) => a.actionType === "REMOVE_CONTENT").effectSummary.restoredByActionId).toBe(restored.body.id);
      expect(await prisma.adminAuditLog.count({ where: { entityId: caseId, action: "trust_action.taken" } })).toBe(2);
    });

    it("suspending an organization unlists it and pauses its live requests; restore brings back only what it paused", async () => {
      const ops = await admin(AdminRole.ADMIN);
      const org = await ops.c.post("/admin/animal-support/organizations").send({ type: "RESCUE_GROUP", name: `Rescue ${unique()}` }).expect(201);
      const owner = await user("b6-org-owner");
      await ops.c.post(`/admin/animal-support/organizations/${org.body.id}/members`).send({ email: owner.email, role: "OWNER" }).expect(201);
      await prisma.animalSupportOrganization.update({ where: { id: org.body.id }, data: { isPubliclyListed: true, verificationStatus: "VERIFIED" } });
      const live = await publishedNeed(owner.c, ops.c, { organizationId: org.body.id });
      const draft = await owner.c.post("/animal-support/needs").send({ title: "Kennel repairs later", description: "We will need kennel repairs next month.", category: "SHELTER_SUPPLIES", province: "تهران", city: "تهران", organizationId: org.body.id }).expect(201);
      const reporter = await user("b6-reporter");
      const { caseId } = await caseFor(ops.c, reporter.c, "ORGANIZATION", org.body.id);

      await ops.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "SUSPEND", reason: "Multiple scam reports" }).expect(201);
      expect((await prisma.animalSupportOrganization.findUniqueOrThrow({ where: { id: org.body.id } })).isPubliclyListed).toBe(false);
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: live } })).status).toBe("PAUSED");
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: draft.body.id } })).status).toBe("DRAFT");
      await request(server).get(`/animal-support/organizations/${org.body.id}`).expect(404);
      await eventually(async () => (await prisma.notification.count({ where: { userId: owner.userId, type: "ngo.suspended" } })) === 1);

      await ops.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "Documents verified" }).expect(201);
      expect((await prisma.animalSupportOrganization.findUniqueOrThrow({ where: { id: org.body.id } })).isPubliclyListed).toBe(true);
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: live } })).status).toBe("PUBLISHED");
      expect((await prisma.supportNeedListing.findUniqueOrThrow({ where: { id: draft.body.id } })).status).toBe("DRAFT");
    });

    it("a lost-pet incident can be closed (pet untouched) and restored; a scam sighting is rejected; only trust staff may act", async () => {
      const o = await owner();
      const incident = await o.c.post(`/pets/${o.petId}/lost-incidents`).send({ description: "Lost near the market", publicArea: "Tajrish", lastKnownLatitude: EXACT_LAT, lastKnownLongitude: EXACT_LNG, contactPreference: "IN_APP_MESSAGE" }).expect(201);
      const petBefore = await prisma.pet.findUniqueOrThrow({ where: { id: o.petId } });
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const reporter = await user("b6-reporter");
      const { caseId } = await caseFor(mod.c, reporter.c, "LOST_PET_INCIDENT", incident.body.id);
      const context = await mod.c.get(`/admin/trust/cases/${caseId}/context`).expect(200);
      expect(leaksExactCoordinates(context.body)).toBe(false);

      const verifier = await admin(AdminRole.VERIFICATION);
      await verifier.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "no" }).expect(403);
      await verifier.c.get(`/admin/trust/cases/${caseId}/context`).expect(403);
      await reporter.c.get(`/admin/trust/cases/${caseId}/context`).expect(403);

      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "Fake incident used to collect money" }).expect(201);
      await request(server).get(`/lost-pets/${incident.body.id}`).expect(404);
      expect((await prisma.pet.findUniqueOrThrow({ where: { id: o.petId } })).lifecycleStatus).toBe(petBefore.lifecycleStatus);
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "Owner confirmed" }).expect(201);
      const back = await prisma.lostPetIncident.findUniqueOrThrow({ where: { id: incident.body.id } });
      expect(back.status).toBe(incident.body.status);
      expect(back.closedAt).toBeNull();

      // Sighting: reported by the household, escalated, rejected.
      const primed = await request(server).get("/health/live");
      const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
      const sighting = await request(server).post(`/lost-pets/${incident.body.id}/sightings`).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ seenAt: new Date().toISOString(), description: "Pay a reward first" }).expect(201);
      const s = await caseFor(mod.c, o.c, "LOST_PET_SIGHTING", sighting.body.id);
      await mod.c.post(`/admin/trust/cases/${s.caseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "Extortion attempt" }).expect(201);
      expect((await prisma.lostPetSighting.findUniqueOrThrow({ where: { id: sighting.body.id } })).status).toBe("REJECTED");
    });

    it("community content: RESTRICT hides, RESTORE brings it back, and restore without a prior effect is refused", async () => {
      const author = await user("b6-author");
      const mod = await admin(AdminRole.TRUST_SAFETY);
      const post = await author.c.post("/community/posts").send({ type: "GENERAL", body: "Borderline post" }).expect(201);
      const report = await (await user("b6-reporter")).c.post(`/community/posts/${post.body.id}/report`).send({ reason: "HARASSMENT" }).expect(201);
      const escalated = await mod.c.post(`/admin/community/reports/${report.body.id}/escalate`).send({ reason: "Check tone" }).expect(201);
      const caseId = escalated.body.trustCaseId as string;
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "nothing yet" }).expect(409);
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTRICT", reason: "Hide while reviewing" }).expect(201);
      await request(server).get(`/community/posts/${post.body.id}`).expect(404);
      await mod.c.post(`/admin/trust/cases/${caseId}/actions`).send({ actionType: "RESTORE", reason: "Fine after all" }).expect(201);
      await request(server).get(`/community/posts/${post.body.id}`).expect(200);
    });
  });

});
