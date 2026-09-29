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
});
