import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Client = ReturnType<typeof authed>;
function authed(app: INestApplication, session: string, csrf: string) {
  const cookie = `petlife_session=${session}; petlife_csrf=${csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    put: (url: string) => request(app.getHttpServer()).put(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    del: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookie).set("x-csrf-token", csrf),
  };
}

/** Pet safety: completeness, emergency info, share cards (emergency / ID tag) and care handoffs. */
describe("Pet safety", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pub = (token: string) => request(app.getHttpServer()).get(`/public/pet-cards/${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  async function signUp(tag: string): Promise<{ client: Client; userId: string; email: string }> {
    const email = `safety-${tag}-${unique()}@example.com`;
    const primed = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier: email }).expect(200);
    const line = logSpy.mock.calls.find((a) => typeof a[0] === "string" && a[0].includes("[DEV OTP]") && a[0].includes(email))![0] as string;
    const code = /code=(\d+)/.exec(line)![1];
    const res = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier: email, code }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { client: authed(app, extractCookie(res.headers["set-cookie"], "petlife_session")!, csrf), userId: user.id, email };
  }

  async function owner() {
    const o = await signUp("owner");
    const hh = (await o.client.post("/households").send({}).expect(201)).body;
    const pet = (await o.client.post(`/households/${hh.id}/pets`).send({ name: "Safety Dog", species: "DOG", approximateAgeMonths: 30 }).expect(201)).body;
    return { ...o, householdId: hh.id as string, petId: pet.id as string };
  }

  it("completeness is server-derived and moves with real data", async () => {
    const o = await owner();
    const before = (await o.client.get(`/pets/${o.petId}/completeness`).expect(200)).body;
    expect(before.missingFields).toEqual(expect.arrayContaining(["photo", "breed", "weight", "microchip", "emergencyContact", "vaccinationHistory", "medicalDocument"]));
    expect(before.completedFields).toEqual(expect.arrayContaining(["species", "birthDate"]));
    await o.client.put(`/pets/${o.petId}/emergency-info`).send({ contactName: "Sara", contactPhone: "+98 912 000 0000", bloodType: "DEA 1.1+" }).expect(200);
    const after = (await o.client.get(`/pets/${o.petId}/completeness`).expect(200)).body;
    expect(after.completedFields).toContain("emergencyContact");
    expect(after.completionScore).toBeGreaterThan(before.completionScore);
    const stranger = await signUp("stranger");
    for (const path of ["completeness", "emergency-info", "emergency-snapshot", "share-cards", "care-handoffs"]) expect([403, 404]).toContain((await stranger.client.get(`/pets/${o.petId}/${path}`)).status);
    await o.client.put(`/pets/${o.petId}/emergency-info`).send({ contactPhone: "not a phone!" }).expect(400);
  });

  it("share cards: token shown once, scoped content, rotate/revoke/expiry all close the old link", async () => {
    const o = await owner();
    await o.client.put(`/pets/${o.petId}/emergency-info`).send({ contactName: "Sara", contactPhone: "09120000000", criticalNotes: "Epileptic — keep calm" }).expect(200);
    await o.client.post(`/pets/${o.petId}/health/allergies`).send({ name: "Penicillin", reaction: "Hives" }).expect(201);

    // A phone is public only with explicit consent.
    await o.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "EMERGENCY", contactMode: "BOTH" }).expect(400);
    const em = (await o.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "EMERGENCY", contactMode: "BOTH", phoneConsent: true }).expect(201)).body;
    expect(em.token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(new Date(em.expiresAt).getTime() - Date.now()).toBeGreaterThan(71 * 3600e3);
    const read = (await pub(em.token).expect(200)).body;
    expect(read).toMatchObject({ kind: "EMERGENCY", name: "Safety Dog", criticalNotes: "Epileptic — keep calm", emergencyContact: { phone: "09120000000" } });
    expect(read.allergies.map((a: { name: string }) => a.name)).toEqual(["Penicillin"]);
    // Never the full record.
    expect(Object.keys(read)).not.toEqual(expect.arrayContaining(["documents", "visits", "householdId"]));
    const listed = (await o.client.get(`/pets/${o.petId}/share-cards`).expect(200)).body;
    expect(JSON.stringify(listed)).not.toContain(em.token);
    expect(listed[0]).toMatchObject({ state: "ACTIVE", accessCount: 1, tokenHint: em.token.slice(-4) });

    const rotated = (await o.client.post(`/pets/${o.petId}/share-cards/${em.id}/rotate`).expect(201)).body;
    await pub(em.token).expect(404);
    await pub(rotated.token).expect(200);
    await o.client.post(`/pets/${o.petId}/share-cards/${rotated.id}/revoke`).expect(201);
    await pub(rotated.token).expect(404);

    const tag = (await o.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "ID_TAG" }).expect(201)).body;
    expect(tag.expiresAt).toBeNull();
    const tagRead = (await pub(tag.token).expect(200)).body;
    expect(tagRead).toMatchObject({ kind: "ID_TAG", name: "Safety Dog", emergencyContact: null, isReportedLost: false });
    expect(tagRead.allergies).toBeUndefined();
    // A new ID tag replaces the previous one.
    const tag2 = (await o.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "ID_TAG", contactMode: "PHONE", phoneConsent: true }).expect(201)).body;
    await pub(tag.token).expect(404);
    expect((await pub(tag2.token).expect(200)).body.emergencyContact).toMatchObject({ phone: "09120000000" });
    // Expired looks the same as unknown.
    await prisma.petShareCard.update({ where: { id: tag2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await pub(tag2.token).expect(404);
    await pub("not-a-real-token-but-long-enough").expect(404);
    await o.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "EMERGENCY", expiresInHours: 721 }).expect(400);

    // A view-only household member cannot create cards.
    const viewer = await signUp("viewer");
    await prisma.householdMember.create({ data: { householdId: o.householdId, userId: viewer.userId, role: "FAMILY" } });
    await prisma.petAccessGrant.create({ data: { petId: o.petId, userId: viewer.userId, canViewIdentity: true } });
    await viewer.client.post(`/pets/${o.petId}/share-cards`).send({ kind: "ID_TAG" }).expect(403);
    await viewer.client.get(`/pets/${o.petId}/completeness`).expect(200);
  });

  it("care handoff: scoped, time-boxed access for someone outside the household, revocable", async () => {
    const o = await owner();
    await o.client.put(`/pets/${o.petId}/emergency-info`).send({ contactPhone: "09120000001" }).expect(200);
    const sitter = await signUp("sitter");
    const end = new Date(Date.now() + 3 * 86400e3).toISOString();
    const h = (await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: sitter.email, scopes: ["CARE", "EMERGENCY_HEALTH"], expiresAt: end }).expect(201)).body;
    expect(h).toMatchObject({ state: "ACTIVE", scopes: ["BASIC_PROFILE", "CARE", "EMERGENCY_HEALTH"] });
    expect(await prisma.notification.count({ where: { userId: sitter.userId, type: "pet.care_handoff_granted", deepLink: `/pets/${o.petId}` } })).toBe(1);

    await sitter.client.get(`/pets/${o.petId}`).expect(200);
    await sitter.client.get(`/pets/${o.petId}/care-profile`).expect(200);
    expect((await sitter.client.get(`/pets/${o.petId}/emergency-snapshot`).expect(200)).body.emergencyContact).toMatchObject({ phone: "09120000001" });
    // The full health record stays closed.
    await sitter.client.get(`/pets/${o.petId}/health/allergies`).expect(403);
    await sitter.client.get(`/pets/${o.petId}/share-cards`).expect(403);
    expect((await sitter.client.get("/me/care-handoffs").expect(200)).body.map((x: { pet: { id: string } }) => x.pet.id)).toEqual([o.petId]);

    await o.client.del(`/pets/${o.petId}/care-handoffs/${h.id}`).expect(200);
    expect([403, 404]).toContain((await sitter.client.get(`/pets/${o.petId}`)).status);
    await o.client.del(`/pets/${o.petId}/care-handoffs/${h.id}`).expect(404);

    // Without EMERGENCY_HEALTH there is no snapshot; an upcoming handoff gives nothing yet.
    const walker = await signUp("walker");
    await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: walker.email, scopes: ["CARE"], expiresAt: end }).expect(201);
    await walker.client.get(`/pets/${o.petId}/emergency-snapshot`).expect(403);
    const later = await signUp("later");
    const up = (await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: later.email, scopes: ["BOOKINGS"], startsAt: new Date(Date.now() + 86400e3).toISOString(), expiresAt: end }).expect(201)).body;
    expect(up.state).toBe("UPCOMING");
    expect([403, 404]).toContain((await later.client.get(`/pets/${o.petId}`)).status);

    // Validation and safety.
    await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: sitter.email, scopes: ["CARE"], expiresAt: new Date(Date.now() + 31 * 86400e3).toISOString() }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: sitter.email, scopes: ["EVERYTHING"], expiresAt: end }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: `nobody-${unique()}@example.com`, scopes: ["CARE"], expiresAt: end }).expect(404);
    await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: o.email, scopes: ["CARE"], expiresAt: end }).expect(400);
    // A sitter can never hand the pet on.
    const sitter2 = await signUp("sitter2");
    const h2 = (await o.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: sitter2.email, scopes: ["CARE"], expiresAt: end }).expect(201)).body;
    await sitter2.client.post(`/pets/${o.petId}/care-handoffs`).send({ email: (await signUp("x")).email, scopes: ["CARE"], expiresAt: end }).expect(403);
    expect(h2.state).toBe("ACTIVE");
  });
});
