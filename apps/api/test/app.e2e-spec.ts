import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import {
  PetAccessSource,
  HouseholdRole,
  ProviderType,
  ProviderVerificationStatus,
  ProviderServiceType,
  ProviderUserRole,
} from "@prisma/client";
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

  describe("Health Basics + Care Profile (Handoff 02)", () => {
    it("denies health endpoints to a user with no active grant on the pet (IDOR)", async () => {
      const ownerIdentifier = `health-owner-${unique()}@example.com`;
      const strangerIdentifier = `health-stranger-${unique()}@example.com`;
      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const stranger = authedRequest(app, await signUp(app, logSpy, strangerIdentifier));

      const household = await owner.post("/households").send({}).expect(201);
      const pet = await owner
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);

      const denied = await stranger.get(`/pets/${pet.body.id}/health/summary`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("denies the care profile endpoints to a user with no active grant on the pet (IDOR)", async () => {
      const ownerIdentifier = `care-owner-${unique()}@example.com`;
      const strangerIdentifier = `care-stranger-${unique()}@example.com`;
      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const stranger = authedRequest(app, await signUp(app, logSpy, strangerIdentifier));

      const household = await owner.post("/households").send({}).expect(201);
      const pet = await owner
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);

      const denied = await stranger.get(`/pets/${pet.body.id}/care-profile`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("keeps Known Negative and Unknown as distinct, never-collapsed allergy states", async () => {
      const identifier = `knowledge-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      const untouched = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(untouched.body.allergyState).toBe("INCOMPLETE");

      await client.patch(`/pets/${petId}/health/profile`).send({ allergiesOverallState: "NONE_KNOWN" }).expect(200);
      const knownNegative = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(knownNegative.body.allergyState).toBe("KNOWN_NEGATIVE");

      await client.patch(`/pets/${petId}/health/profile`).send({ allergiesOverallState: "UNKNOWN" }).expect(200);
      const unknown = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(unknown.body.allergyState).toBe("UNKNOWN");

      await client.post(`/pets/${petId}/health/allergies`).send({ name: "Chicken" }).expect(201);
      const knownPresent = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(knownPresent.body.allergyState).toBe("KNOWN_PRESENT");
    });

    it("creates an allergy and lists it back for the pet", async () => {
      const identifier = `allergy-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      const created = await client
        .post(`/pets/${petId}/health/allergies`)
        .send({ name: "Pollen", severity: "MILD" })
        .expect(201);
      expect(created.body.name).toBe("Pollen");
      expect(created.body.recordedByUserId).toBeDefined();
      expect(created.body.sourceType).toBe("OWNER");

      const list = await client.get(`/pets/${petId}/health/allergies`).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe("Pollen");
    });

    it("adds an active medication and reflects it in the health summary's active count", async () => {
      const identifier = `medication-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      await client
        .post(`/pets/${petId}/health/medications`)
        .send({ name: "Apoquel", dosage: 16, unit: "mg", status: "ACTIVE" })
        .expect(201);
      await client
        .post(`/pets/${petId}/health/medications`)
        .send({ name: "Old prescription", status: "COMPLETED" })
        .expect(201);

      const summary = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(summary.body.activeMedicationCount).toBe(1);
      expect(summary.body.medicationsState).toBe("KNOWN_PRESENT");
    });

    it("never derives OVERDUE from an UNKNOWN or unset vaccination status", async () => {
      const identifier = `vax-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Milo", species: "CAT", approximateAgeMonths: 6 })
        .expect(201);
      const petId = pet.body.id;

      const untouched = await client.get(`/pets/${petId}/health/vaccination-summary`).expect(200);
      expect(untouched.body.status).toBe("INCOMPLETE");

      const declaredUnknown = await client
        .put(`/pets/${petId}/health/vaccination-summary`)
        .send({ status: "UNKNOWN" })
        .expect(200);
      expect(declaredUnknown.body.status).toBe("UNKNOWN");

      const summary = await client.get(`/pets/${petId}/health/summary`).expect(200);
      expect(summary.body.vaccinationStatus).not.toBe("OVERDUE");
      expect(summary.body.vaccinationStatus).toBe("UNKNOWN");
    });

    it("updates the care profile and recomputes its setup status", async () => {
      const identifier = `care-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      const initial = await client.get(`/pets/${petId}/care-profile`).expect(200);
      expect(initial.body.status).toBe("NOT_STARTED");

      const partial = await client
        .put(`/pets/${petId}/care-profile`)
        .send({ temperamentText: "Calm and friendly" })
        .expect(200);
      expect(partial.body.status).toBe("PARTIAL");

      const full = await client
        .put(`/pets/${petId}/care-profile`)
        .send({
          temperamentText: "Calm and friendly",
          aroundPeopleText: "Loves everyone",
          aroundAnimalsText: "Gets along with cats",
          leashBehaviorText: "Walks well on leash",
          handlingSensitivityText: "Sensitive around paws",
          feedingRoutineText: "Twice a day",
          toiletRoutineText: "Three walks a day",
          separationBehaviorText: "Mild anxiety alone",
          specialInstructionsText: "None",
        })
        .expect(200);
      expect(full.body.status).toBe("COMPLETE");
    });

    it("ranks viewing vaccination status as Home's primary action when it is due soon", async () => {
      const identifier = `home-vax-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      await client.put(`/pets/${petId}/health/vaccination-summary`).send({ status: "DUE_SOON" }).expect(200);

      const home = await client.get("/home").expect(200);
      expect(home.body.primaryAction.kind).toBe("VIEW_VACCINATION");
      expect(home.body.primaryAction.href).toContain(petId);
    });

    it("never surfaces a health recommendation on Home when the caller lacks canViewHealth", async () => {
      const ownerIdentifier = `home-perm-owner-${unique()}@example.com`;
      const limitedIdentifier = `home-perm-limited-${unique()}@example.com`;
      const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
      const limitedCookies = await signUp(app, logSpy, limitedIdentifier);
      const limited = authedRequest(app, limitedCookies);
      const limitedSession = await limited.get("/auth/session").expect(200);
      const limitedId: string = limitedSession.body.user.id;

      const household = await owner.post("/households").send({}).expect(201);
      const householdId = household.body.id;
      const pet = await owner
        .post(`/households/${householdId}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const petId = pet.body.id;

      // Vaccination is due soon — an owner or family member would see VIEW_VACCINATION.
      await owner.put(`/pets/${petId}/health/vaccination-summary`).send({ status: "DUE_SOON" }).expect(200);

      // Added to the household *after* the pet exists, so applyHouseholdDefaults never
      // ran for them on this pet — a manual grant gives identity access only, no health.
      await prisma.householdMember.create({ data: { householdId, userId: limitedId, role: HouseholdRole.FAMILY } });
      await prisma.petAccessGrant.create({
        data: { petId, userId: limitedId, source: PetAccessSource.MANUAL, canViewIdentity: true },
      });

      await limited.put(`/households/${householdId}/active-pet`).send({ petId }).expect(200);

      const home = await limited.get("/home").expect(200);
      expect(home.body.primaryAction.kind).not.toBe("VIEW_VACCINATION");
      expect(home.body.primaryAction.kind).not.toBe("COMPLETE_HEALTH");
    });

    it("keeps the Health summary scoped to the active pet — switching pets never leaks the previous pet's data", async () => {
      const identifier = `switch-health-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      const household = await client.post("/households").send({}).expect(201);
      const householdId = household.body.id;
      const luna = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const milo = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Milo", species: "CAT", approximateAgeMonths: 6 })
        .expect(201);

      await client.put(`/pets/${luna.body.id}/health/vaccination-summary`).send({ status: "DUE_SOON" }).expect(200);
      await client.post(`/pets/${luna.body.id}/health/allergies`).send({ name: "Pollen" }).expect(201);

      const homeWithLuna = await client.get("/home").expect(200);
      expect(homeWithLuna.body.primaryAction.href).toContain(luna.body.id);
      expect(homeWithLuna.body.primaryAction.kind).toBe("VIEW_VACCINATION");

      await client.put(`/households/${householdId}/active-pet`).send({ petId: milo.body.id }).expect(200);

      const miloSummary = await client.get(`/pets/${milo.body.id}/health/summary`).expect(200);
      expect(miloSummary.body.allergyState).toBe("INCOMPLETE");
      expect(miloSummary.body.vaccinationStatus).toBe("INCOMPLETE");

      const homeWithMilo = await client.get("/home").expect(200);
      expect(homeWithMilo.body.primaryAction.href).toContain(milo.body.id);
      expect(homeWithMilo.body.primaryAction.href).not.toContain(luna.body.id);
      expect(homeWithMilo.body.primaryAction.kind).not.toBe("VIEW_VACCINATION");
    });

    it("resumes onboarding into the Health Basics chapter across requests", async () => {
      const identifier = `onboard-health-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      await client
        .put("/onboarding/progress")
        .send({ chapter: "HEALTH_BASICS", step: "health-allergies", status: "COMPLETED" })
        .expect(200);

      const resumed = await client.get("/onboarding").expect(200);
      expect(resumed.body.chapter).toBe("HEALTH_BASICS");
      expect(resumed.body.completedSteps).toContain("health-allergies");
    });

    it("completes onboarding even when every Health Basics question was left unanswered", async () => {
      const identifier = `onboard-skip-health-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));

      // No health/nutrition/care-profile endpoint is ever called for this user.
      const completed = await client.post("/onboarding/complete").send({}).expect(201);
      expect(completed.body.status).toBe("COMPLETED");
      expect(completed.body.chapter).toBe("READY");
    });
  });

  describe("Find a Vet + Vet Booking Basics (Handoff 03)", () => {
    /**
     * A verified clinic with one service and availability every day,
     * 00:00-23:30 UTC in 30-minute slots — deliberately timezone-simple and
     * wide enough that a slot is always bookable "right now" regardless of
     * when this suite actually runs.
     */
    async function seedVerifiedClinic() {
      const vetUser = await prisma.user.create({
        data: { email: `vet-${unique()}@example.com`, displayName: "Dr. Test Vet" },
      });
      const organization = await prisma.providerOrganization.create({
        data: { name: `Test Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED },
      });
      const location = await prisma.providerLocation.create({
        data: { providerOrganizationId: organization.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US", timezone: "UTC" },
      });
      const providerUser = await prisma.providerUser.create({
        data: { userId: vetUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.VET },
      });
      const service = await prisma.providerService.create({
        data: {
          providerOrganizationId: organization.id,
          locationId: location.id,
          name: "General Vet Visit",
          type: ProviderServiceType.GENERAL_VET_VISIT,
          durationMinutes: 30,
        },
      });
      await prisma.providerAvailabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          providerOrganizationId: organization.id,
          locationId: location.id,
          providerUserId: providerUser.id,
          dayOfWeek,
          startLocalTime: "00:00",
          endLocalTime: "23:30",
          timezone: "UTC",
        })),
      });
      return { vetUser, organization, location, providerUser, service };
    }

    async function firstAvailableSlot(client: ReturnType<typeof authedRequest>, providerId: string, locationId: string, serviceId: string) {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const res = await client
        .get(`/providers/vets/${providerId}/availability?locationId=${locationId}&serviceId=${serviceId}&from=${from}&to=${to}`)
        .expect(200);
      const slot = res.body.slots.find((s: { state: string }) => s.state === "AVAILABLE");
      if (!slot) throw new Error("No available slot found in fixture window");
      return slot;
    }

    async function setupOwnerWithPet() {
      const identifier = `vet-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Rex", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      return { client, householdId: household.body.id, petId: pet.body.id };
    }

    it("returns only VERIFIED providers by default", async () => {
      const { client } = await setupOwnerWithPet();
      const { organization } = await seedVerifiedClinic();
      const unverified = await prisma.providerOrganization.create({
        data: { name: `Unverified Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.SUBMITTED },
      });

      const results = await client.get("/providers/vets").expect(200);
      const ids = results.body.map((p: { id: string }) => p.id);
      expect(ids).toContain(organization.id);
      expect(ids).not.toContain(unverified.id);
    });

    it("rejects a booking hold when the service doesn't support the pet's species", async () => {
      const { client, householdId } = await setupOwnerWithPet();
      const cat = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Whiskers", species: "CAT", approximateAgeMonths: 12 })
        .expect(201);
      const { organization, location, service } = await seedVerifiedClinic();
      await prisma.providerService.update({ where: { id: service.id }, data: { supportsCat: false } });

      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);
      const denied = await client
        .post("/booking-holds")
        .send({ petId: cat.body.id, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(400);
      expect(denied.body.error.code).toBe("PET_NOT_SUPPORTED");
    });

    it("generates deterministic availability slots for the requested range", async () => {
      const { client } = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();

      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);
      expect(slot.state).toBe("AVAILABLE");
      expect(new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()).toBe(30 * 60 * 1000);
    });

    it("reports HOLD_EXPIRED when confirming with a hold that no longer exists", async () => {
      const { client, petId } = await setupOwnerWithPet();

      const response = await client
        .post("/bookings")
        .send({ holdId: "00000000-0000-0000-0000-000000000000", petId })
        .expect(410);
      expect(response.body.error.code).toBe("HOLD_EXPIRED");
    });

    it("prevents double-booking the same slot", async () => {
      const first = await setupOwnerWithPet();
      const second = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(first.client, organization.id, location.id, service.id);

      const hold1 = await first.client
        .post("/booking-holds")
        .send({ petId: first.petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await first.client.post("/bookings").send({ holdId: hold1.body.holdId, petId: first.petId }).expect(201);

      // The slot is now BOOKED — a fresh hold attempt on the exact same instant must be rejected.
      const secondHold = await second.client
        .post("/booking-holds")
        .send({ petId: second.petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(409);
      expect(secondHold.body.error.code).toBe("SLOT_UNAVAILABLE");
    });

    it("treats a retried booking confirmation with the same Idempotency-Key as a single booking", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);

      const idempotencyKey = `confirm-${unique()}`;
      const first = await client
        .post("/bookings")
        .set("Idempotency-Key", idempotencyKey)
        .send({ holdId: hold.body.holdId, petId })
        .expect(201);
      const second = await client
        .post("/bookings")
        .set("Idempotency-Key", idempotencyKey)
        .send({ holdId: hold.body.holdId, petId })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      const count = await prisma.booking.count({ where: { petId } });
      expect(count).toBe(1);
    });

    it("records the booking against the pet that was actually held, not just any pet in the household", async () => {
      const { client, householdId, petId } = await setupOwnerWithPet();
      const otherPet = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Milo", species: "CAT", approximateAgeMonths: 12 })
        .expect(201);
      const { organization, location, service } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      expect(booking.body.petId).toBe(petId);
      expect(booking.body.petId).not.toBe(otherPet.body.id);
    });

    it("denies a booking hold for a user with no active access to the pet (IDOR)", async () => {
      const { petId } = await setupOwnerWithPet();
      const stranger = authedRequest(app, await signUp(app, logSpy, `vet-stranger-${unique()}@example.com`));
      const { organization, location, service } = await seedVerifiedClinic();

      const slot = await firstAvailableSlot(stranger, organization.id, location.id, service.id);
      const denied = await stranger
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("creates a TEMPORARY health-access grant for the assigned vet on confirmation, without touching the household grant", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, vetUser } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const householdGrantsBefore = await prisma.petAccessGrant.findMany({ where: { petId, source: PetAccessSource.HOUSEHOLD } });

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId, healthAccessSelection: "HEALTH_BASICS" }).expect(201);

      const vetGrant = await prisma.petAccessGrant.findFirst({ where: { petId, userId: vetUser.id, source: PetAccessSource.TEMPORARY } });
      expect(vetGrant).not.toBeNull();
      expect(vetGrant?.canViewHealth).toBe(true);
      expect(vetGrant?.canEditHealth).toBe(false);

      const householdGrantsAfter = await prisma.petAccessGrant.findMany({ where: { petId, source: PetAccessSource.HOUSEHOLD } });
      expect(householdGrantsAfter).toHaveLength(householdGrantsBefore.length);
      expect(householdGrantsAfter.map((g) => ({ ...g, updatedAt: undefined }))).toEqual(
        householdGrantsBefore.map((g) => ({ ...g, updatedAt: undefined })),
      );
    });

    it("revokes the temporary health-access grant when its booking is cancelled", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, vetUser } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      await client.post(`/bookings/${booking.body.id}/cancel`).send({ reason: "Can't make it" }).expect(201);

      const vetGrant = await prisma.petAccessGrant.findFirst({ where: { petId, userId: vetUser.id, source: PetAccessSource.TEMPORARY } });
      expect(vetGrant?.revokedAt).not.toBeNull();

      const vetClient = authedRequest(app, await signUp(app, logSpy, vetUser.email!));
      const denied = await vetClient.get(`/pets/${petId}/health/summary`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("stops authorizing the vet once their temporary grant has expired", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, vetUser } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      await prisma.petAccessGrant.updateMany({
        where: { petId, userId: vetUser.id, source: PetAccessSource.TEMPORARY },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const vetClient = authedRequest(app, await signUp(app, logSpy, vetUser.email!));
      const denied = await vetClient.get(`/pets/${petId}/health/summary`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("projects a confirmed booking into the Care Calendar, and removes it once cancelled", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const calendarBefore = await client.get("/care-calendar").expect(200);
      expect(calendarBefore.body.some((e: { bookingId: string }) => e.bookingId === booking.body.id)).toBe(true);

      await client.post(`/bookings/${booking.body.id}/cancel`).send({}).expect(201);

      const calendarAfter = await client.get("/care-calendar").expect(200);
      expect(calendarAfter.body.some((e: { bookingId: string }) => e.bookingId === booking.body.id)).toBe(false);
    });

    it("surfaces an upcoming confirmed booking on Home once health basics are otherwise complete", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();

      // Satisfy every Health Basics domain so COMPLETE_HEALTH never outranks the booking.
      await client.patch(`/pets/${petId}/health/profile`).send({
        allergiesOverallState: "NONE_KNOWN",
        conditionsOverallState: "NONE_KNOWN",
        medicationsOverallState: "NONE_KNOWN",
      });
      await client.put(`/pets/${petId}/health/vaccination-summary`).send({ status: "UP_TO_DATE" });

      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const home = await client.get("/home").expect(200);
      expect(home.body.primaryAction.kind).toBe("VIEW_BOOKING");
      expect(home.body.primaryAction.href).toBe(`/bookings/${booking.body.id}`);
    });

    it("keeps a Milo-context switch from ever surfacing Luna's booking on Home", async () => {
      const identifier = `vet-switch-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const luna = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const milo = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Milo", species: "CAT", approximateAgeMonths: 12 })
        .expect(201);

      const { organization, location, service } = await seedVerifiedClinic();
      await client.patch(`/pets/${luna.body.id}/health/profile`).send({
        allergiesOverallState: "NONE_KNOWN",
        conditionsOverallState: "NONE_KNOWN",
        medicationsOverallState: "NONE_KNOWN",
      });
      await client.put(`/pets/${luna.body.id}/health/vaccination-summary`).send({ status: "UP_TO_DATE" });

      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId: luna.body.id, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId: luna.body.id }).expect(201);

      await client.put(`/households/${household.body.id}/active-pet`).send({ petId: milo.body.id }).expect(200);

      const home = await client.get("/home").expect(200);
      expect(home.body.primaryAction.kind).not.toBe("VIEW_BOOKING");
    });

    it("denies reading a booking to a user with no active access to its pet", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const stranger = authedRequest(app, await signUp(app, logSpy, `vet-read-stranger-${unique()}@example.com`));
      const denied = await stranger.get(`/bookings/${booking.body.id}`).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("gates the vet's temporary access at canViewHealth/canEditHealth exactly — view works, edit does not", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, vetUser } = await seedVerifiedClinic();
      const slot = await firstAvailableSlot(client, organization.id, location.id, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId, healthAccessSelection: "HEALTH_BASICS" }).expect(201);

      const vetClient = authedRequest(app, await signUp(app, logSpy, vetUser.email!));
      await vetClient.get(`/pets/${petId}/health/summary`).expect(200);
      const editDenied = await vetClient.patch(`/pets/${petId}/health/profile`).send({ allergiesOverallState: "NONE_KNOWN" }).expect(403);
      expect(editDenied.body.error.code).toBe("PET_ACCESS_DENIED");
    });
  });
});
