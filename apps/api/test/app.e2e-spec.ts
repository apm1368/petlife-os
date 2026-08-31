import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { PetAccessSource, HouseholdRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

/** Extracts the code the DevOtpProvider logs instead of sending an SMS/email. */
function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find(
    (args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier),
  );
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
  await request(app.getHttpServer())
    .post("/auth/request-otp")
    .set("Cookie", `petlife_csrf=${primed.csrf}`)
    .set("x-csrf-token", primed.csrf!)
    .send({ identifier })
    .expect(200);

  const code = captureOtpCode(logSpy, identifier);

  const verifyRes = await request(app.getHttpServer())
    .post("/auth/verify-otp")
    .set("Cookie", `petlife_csrf=${primed.csrf}`)
    .set("x-csrf-token", primed.csrf!)
    .send({ identifier, code })
    .expect(200);

  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) =>
      request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    put: (url: string) =>
      request(app.getHttpServer()).put(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

describe("PET LIFE OS critical paths (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("requests and verifies an OTP to establish a session", async () => {
    const identifier = `sarah-${unique()}@example.com`;
    const cookies = await signUp(app, logSpy, identifier);
    expect(cookies.session).toBeDefined();

    const client = authedRequest(app, cookies);
    const sessionRes = await client.get("/auth/session").expect(200);
    expect(sessionRes.body.user.email).toBe(identifier);
  });

  it("denies access to a pet the user has no PetAccess grant for (IDOR)", async () => {
    const ownerIdentifier = `owner-${unique()}@example.com`;
    const strangerIdentifier = `stranger-${unique()}@example.com`;

    const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
    const stranger = authedRequest(app, await signUp(app, logSpy, strangerIdentifier));

    const household = await owner.post("/households").send({ name: "Owner Home" }).expect(201);
    const pet = await owner
      .post(`/households/${household.body.id}/pets`)
      .send({ name: "Luna", species: "DOG", birthDate: "2022-03-15" })
      .expect(201);

    const denied = await stranger.get(`/pets/${pet.body.id}`).expect(403);
    expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
  });

  it("creates a household, creates a pet with optional fields skipped, and auto-activates it", async () => {
    const identifier = `flow-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;

    const luna = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
      .expect(201);
    expect(luna.body.breed).toBeNull();
    expect(luna.body.photoUrl).toBeNull();

    const activePet = await client.get(`/households/${householdId}/active-pet`).expect(200);
    expect(activePet.body.id).toBe(luna.body.id);
  });

  it("switches active pet between Luna and Milo, and Home reflects the change", async () => {
    const identifier = `switcher-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;

    const luna = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
      .expect(201);
    const milo = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Milo", species: "CAT", approximateAgeMonths: 18 })
      .expect(201);

    const homeWithLuna = await client.get("/home").expect(200);
    expect(homeWithLuna.body.activePet.id).toBe(luna.body.id);

    await client.put(`/households/${householdId}/active-pet`).send({ petId: milo.body.id }).expect(200);

    const homeWithMilo = await client.get("/home").expect(200);
    expect(homeWithMilo.body.activePet.id).toBe(milo.body.id);
  });

  it("resumes onboarding progress across requests", async () => {
    const identifier = `onboard-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const initial = await client.get("/onboarding").expect(200);
    expect(initial.body.status).toBe("IN_PROGRESS");
    expect(initial.body.chapter).toBe("ACCOUNT");

    await client
      .put("/onboarding/progress")
      .send({ chapter: "HOUSEHOLD", step: "household-setup", status: "COMPLETED" })
      .expect(200);

    const resumed = await client.get("/onboarding").expect(200);
    expect(resumed.body.chapter).toBe("HOUSEHOLD");
    expect(resumed.body.completedSteps).toContain("household-setup");
  });

  it("treats a retried pet creation with the same Idempotency-Key as a single create", async () => {
    const identifier = `idem-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;
    const idempotencyKey = `key-${unique()}`;

    const first = await client
      .post(`/households/${householdId}/pets`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ name: "Rex", species: "DOG", approximateAgeMonths: 6 })
      .expect(201);

    const second = await client
      .post(`/households/${householdId}/pets`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ name: "Rex", species: "DOG", approximateAgeMonths: 6 })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const pets = await client.get(`/households/${householdId}/pets`).expect(200);
    expect(pets.body.filter((p: { name: string }) => p.name === "Rex")).toHaveLength(1);
  });

  describe("schema hardening: grant model, FK policy, constraints", () => {
    it("unions two simultaneous grants for the same user/pet instead of one overwriting the other", async () => {
      const ownerIdentifier = `grant-owner-${unique()}@example.com`;
      const strangerIdentifier = `grant-stranger-${unique()}@example.com`;

      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const strangerCookies = await signUp(app, logSpy, strangerIdentifier);
      const stranger = authedRequest(app, strangerCookies);
      const strangerSession = await stranger.get("/auth/session").expect(200);
      const strangerId: string = strangerSession.body.user.id;

      const household = await owner.post("/households").send({}).expect(201);
      const pet = await owner
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Grantee", species: "DOG", approximateAgeMonths: 12 })
        .expect(201);
      const petId = pet.body.id;

      // First grant: view-only. Baseline access works, edit does not.
      await prisma.petAccessGrant.create({
        data: { petId, userId: strangerId, source: PetAccessSource.MANUAL, canViewIdentity: true },
      });
      await stranger.get(`/pets/${petId}`).expect(200);
      await stranger.patch(`/pets/${petId}`).send({ name: "Renamed" }).expect(403);

      // Second, independent grant adds edit — the union of both must now allow it.
      // The first grant is untouched (nothing overwrites it).
      await prisma.petAccessGrant.create({
        data: { petId, userId: strangerId, source: PetAccessSource.MANUAL, canEditIdentity: true, canViewIdentity: false },
      });
      const grantCount = await prisma.petAccessGrant.count({ where: { petId, userId: strangerId } });
      expect(grantCount).toBe(2);

      await stranger.patch(`/pets/${petId}`).send({ name: "Renamed" }).expect(200);
    });

    it("lets a temporary grant expire without affecting a separate standing grant", async () => {
      const ownerIdentifier = `expiry-owner-${unique()}@example.com`;
      const vetIdentifier = `expiry-vet-${unique()}@example.com`;

      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const vetCookies = await signUp(app, logSpy, vetIdentifier);
      const vet = authedRequest(app, vetCookies);
      const vetSession = await vet.get("/auth/session").expect(200);
      const vetId: string = vetSession.body.user.id;

      const household = await owner.post("/households").send({}).expect(201);
      const pet = await owner
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "TimeBox", species: "CAT", approximateAgeMonths: 8 })
        .expect(201);
      const petId = pet.body.id;

      // Standing grant: no expiry.
      await prisma.petAccessGrant.create({
        data: { petId, userId: vetId, source: PetAccessSource.MANUAL, canViewIdentity: true },
      });
      // Temporary grant: already expired.
      await prisma.petAccessGrant.create({
        data: {
          petId,
          userId: vetId,
          source: PetAccessSource.TEMPORARY,
          canEditIdentity: true,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      // The expired grant does not contribute canEditIdentity to the union...
      await vet.patch(`/pets/${petId}`).send({ name: "Renamed" }).expect(403);
      // ...but the standing grant is unaffected and still authorizes baseline access.
      await vet.get(`/pets/${petId}`).expect(200);
    });

    it("stops authorizing access the moment a grant is revoked", async () => {
      const ownerIdentifier = `revoke-owner-${unique()}@example.com`;
      const sitterIdentifier = `revoke-sitter-${unique()}@example.com`;

      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const sitterCookies = await signUp(app, logSpy, sitterIdentifier);
      const sitter = authedRequest(app, sitterCookies);
      const sitterSession = await sitter.get("/auth/session").expect(200);
      const sitterId: string = sitterSession.body.user.id;

      const household = await owner.post("/households").send({}).expect(201);
      const pet = await owner
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Revokee", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      const grant = await prisma.petAccessGrant.create({
        data: { petId, userId: sitterId, source: PetAccessSource.TEMPORARY, canViewIdentity: true },
      });

      await sitter.get(`/pets/${petId}`).expect(200);

      await prisma.petAccessGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), revokedByUserId: (await owner.get("/auth/session").expect(200)).body.user.id },
      });

      const denied = await sitter.get(`/pets/${petId}`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("keeps the onboarding progress row when its referenced household and pet are deleted", async () => {
      const identifier = `orphan-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const householdId = household.body.id;
      const pet = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Ephemeral", species: "CAT", approximateAgeMonths: 3 })
        .expect(201);

      await client
        .put("/onboarding/progress")
        .send({ chapter: "PET_IDENTITY", step: "species", status: "COMPLETED", householdId, petId: pet.body.id })
        .expect(200);

      const before = await client.get("/onboarding").expect(200);
      expect(before.body.householdId).toBe(householdId);
      expect(before.body.petId).toBe(pet.body.id);

      // Hard delete, bypassing the API (no delete endpoint exists yet) — this
      // exercises the FK's ON DELETE SET NULL policy directly.
      await prisma.pet.delete({ where: { id: pet.body.id } });
      await prisma.household.delete({ where: { id: householdId } });

      const after = await client.get("/onboarding").expect(200);
      expect(after.body.householdId).toBeNull();
      expect(after.body.petId).toBeNull();
      // The row itself, and its progress, survive.
      expect(after.body.chapter).toBe("PET_IDENTITY");
      expect(after.body.status).toBe("COMPLETED");
    });

    it("rejects a duplicate NULL-pet UserPetInterest instead of storing it twice", async () => {
      const identifier = `interest-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const session = await client.get("/auth/session").expect(200);
      const userId: string = session.body.user.id;

      const send = () =>
        client
          .put("/onboarding/progress")
          .send({ chapter: "PERSONALIZATION", step: "personalization", status: "COMPLETED", interests: ["VET"] })
          .expect(200);

      await send();
      await send();

      const count = await prisma.userPetInterest.count({ where: { userId, petId: null, interest: "VET" } });
      expect(count).toBe(1);
    });

    it("rejects setting an active pet that does not belong to the target household", async () => {
      const identifier = `cross-household-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const householdA = await client.post("/households").send({}).expect(201);
      const householdB = await client.post("/households").send({}).expect(201);
      const petInA = await client
        .post(`/households/${householdA.body.id}/pets`)
        .send({ name: "StaysInA", species: "DOG", approximateAgeMonths: 12 })
        .expect(201);

      const response = await client
        .put(`/households/${householdB.body.id}/active-pet`)
        .send({ petId: petInA.body.id })
        .expect(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("requires effective pet access to set an active pet, even for a real household member", async () => {
      const ownerIdentifier = `member-owner-${unique()}@example.com`;
      const familyIdentifier = `member-family-${unique()}@example.com`;

      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const familyCookies = await signUp(app, logSpy, familyIdentifier);
      const family = authedRequest(app, familyCookies);
      const familySession = await family.get("/auth/session").expect(200);
      const familyId: string = familySession.body.user.id;

      const household = await owner.post("/households").send({}).expect(201);
      const householdId = household.body.id;

      // No "invite member" endpoint exists yet — added directly, which is
      // itself what makes this a real household member for HouseholdMemberGuard.
      await prisma.householdMember.create({ data: { householdId, userId: familyId, role: HouseholdRole.FAMILY } });

      const pet = await owner
        .post(`/households/${householdId}/pets`)
        .send({ name: "GuardedPet", species: "CAT", approximateAgeMonths: 6 })
        .expect(201);
      const petId = pet.body.id;

      // applyHouseholdDefaults granted the family member access on pet creation — revoke it.
      await prisma.petAccessGrant.updateMany({
        where: { petId, userId: familyId },
        data: { revokedAt: new Date() },
      });

      // Passes HouseholdMemberGuard (real membership row) but fails PetAccessGuard's
      // equivalent check inside ActivePetService — access, not membership, gates this.
      const response = await family.put(`/households/${householdId}/active-pet`).send({ petId }).expect(403);
      expect(response.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("rejects a user with neither email nor phone at the database layer", async () => {
      await expect(prisma.user.create({ data: { displayName: "No Contact Info" } })).rejects.toThrow();
    });
  });
});
