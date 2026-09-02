import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import {
  PetAccessSource,
  HouseholdRole,
  ProviderType,
  ProviderVerificationStatus,
  ProviderServiceType,
  ProviderUserRole,
  ServiceCategory,
  LocationMode,
  AvailabilityExceptionType,
  BookingStatus,
  SellerVerificationStatus,
  SellerStatus,
  SellerMembershipRole,
  SellerMembershipStatus,
  CheckoutStatus,
  CartStatus,
  OrderStatus,
  FinancingIntentStatus,
  FulfillmentStatus,
  ShipmentStatus,
  ShippingProvider,
  MarketplaceProvider,
  MarketplaceListingSyncStatus,
  InventoryMovementType,
} from "@prisma/client";
import request from "supertest";
import { createHmac } from "node:crypto";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DevPaymentGateway } from "../src/modules/commerce/payments/dev-payment-gateway.service";
import { FulfillmentTransitionService } from "../src/modules/commerce/logistics/fulfillment-transition.service";

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
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
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

  /**
   * Several webhook/reconcile-driven confirmations happen off an async,
   * fire-and-forget domain-event listener (DomainEventsService.publish uses
   * `emitter.emit`, not `emitAsync`) rather than inside the awaited HTTP
   * request — polling the actual DB state is a robust wait for that, unlike
   * a fixed setTimeout which can flake under full-suite system load.
   */
  async function pollUntil<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 5000, intervalMs = 40): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let last: T = await fn();
    while (!predicate(last) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      last = await fn();
    }
    return last;
  }

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
          category: ServiceCategory.VET,
          locationMode: LocationMode.AT_PROVIDER,
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

    it(
      "returns only VERIFIED providers by default",
      async () => {
        const { client } = await setupOwnerWithPet();
        const { organization } = await seedVerifiedClinic();
        const unverified = await prisma.providerOrganization.create({
          data: { name: `Unverified Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.SUBMITTED },
        });

        const results = await client.get("/providers/vets").expect(200);
        const ids = results.body.map((p: { id: string }) => p.id);
        expect(ids).toContain(organization.id);
        expect(ids).not.toContain(unverified.id);
      },
      // This is the first test in the suite to exercise the providers-search
      // path; a cold Prisma connection-pool warm-up on this sandbox's Postgres
      // has been observed to occasionally exceed Jest's 5s default here even
      // though the request itself is fast — a generous explicit timeout is
      // cheaper than chasing a warm-up cost that only ever shows up once.
      // Kept in line with jest-e2e.json's own testTimeout (raised to 20000
      // in Handoff 07 for the same reason: slow-under-load sandbox CI).
      60000,
    );

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
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId, accessSelection: "HEALTH_BASICS" }).expect(201);

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
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId, accessSelection: "HEALTH_BASICS" }).expect(201);

      const vetClient = authedRequest(app, await signUp(app, logSpy, vetUser.email!));
      await vetClient.get(`/pets/${petId}/health/summary`).expect(200);
      const editDenied = await vetClient.patch(`/pets/${petId}/health/profile`).send({ allergiesOverallState: "NONE_KNOWN" }).expect(403);
      expect(editDenied.body.error.code).toBe("PET_ACCESS_DENIED");
    });
  });

  describe("Services Marketplace Basics (Handoff 04)", () => {
    async function setupOwnerWithPet() {
      const identifier = `service-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Rex", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      return { client, householdId: household.body.id, petId: pet.body.id };
    }

    /** A verified provider for one non-vet category, open availability every day 00:00-23:30 UTC. */
    async function seedServiceProvider(
      category: ServiceCategory,
      opts: { locationMode?: LocationMode; requiresCareProfile?: boolean; supportsCat?: boolean; durationMinutes?: number } = {},
    ) {
      const staffUser = await prisma.user.create({
        data: { email: `staff-${unique()}@example.com`, displayName: `${category} Staff` },
      });
      const organization = await prisma.providerOrganization.create({
        data: { name: `Test ${category} Co ${unique()}`, type: ProviderType.MULTI_SERVICE_PROVIDER, verificationStatus: ProviderVerificationStatus.VERIFIED },
      });
      const location = await prisma.providerLocation.create({
        data: { providerOrganizationId: organization.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US", timezone: "UTC" },
      });
      const providerUser = await prisma.providerUser.create({
        data: { userId: staffUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.STAFF },
      });
      const service = await prisma.providerService.create({
        data: {
          providerOrganizationId: organization.id,
          locationId: location.id,
          name: `${category} Service`,
          type: ProviderServiceType.GROOMING_SESSION,
          category,
          locationMode: opts.locationMode ?? LocationMode.AT_PROVIDER,
          durationMinutes: opts.durationMinutes ?? 60,
          requiresCareProfile: opts.requiresCareProfile ?? false,
          supportsCat: opts.supportsCat ?? true,
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
      return { staffUser, organization, location, providerUser, service };
    }

    async function firstAvailableServiceSlot(client: ReturnType<typeof authedRequest>, serviceId: string) {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const res = await client.get(`/provider-services/${serviceId}/availability?from=${from}&to=${to}`).expect(200);
      const slot = res.body.slots.find((s: { state: string }) => s.state === "AVAILABLE");
      if (!slot) throw new Error("No available slot found in fixture window");
      return slot;
    }

    it("exposes the full canonical service category taxonomy", async () => {
      const { client } = await setupOwnerWithPet();
      const res = await client.get("/services/categories").expect(200);
      expect(res.body).toEqual(expect.arrayContaining(["VET", "GROOMING", "TRAINING", "WALKING", "SITTING", "BOARDING", "PET_TAXI"]));
    });

    it("returns only VERIFIED providers by default when discovering non-vet services", async () => {
      const { client } = await setupOwnerWithPet();
      const { organization } = await seedServiceProvider(ServiceCategory.GROOMING);
      const unverified = await prisma.providerOrganization.create({
        data: { name: `Unverified Groomer ${unique()}`, type: ProviderType.GROOMER, verificationStatus: ProviderVerificationStatus.SUBMITTED },
      });

      const results = await client.get("/providers/services?category=GROOMING").expect(200);
      const ids = results.body.map((r: { provider: { id: string } }) => r.provider.id);
      expect(ids).toContain(organization.id);
      expect(ids).not.toContain(unverified.id);
    });

    it("reports NOT_SUPPORTED compatibility and rejects a hold for a species the service doesn't support", async () => {
      const { client, householdId } = await setupOwnerWithPet();
      const cat = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Whiskers", species: "CAT", approximateAgeMonths: 12 })
        .expect(201);
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.WALKING, { supportsCat: false });

      const detail = await client.get(`/provider-services/${service.id}?petId=${cat.body.id}`).expect(200);
      expect(detail.body.compatibility.status).toBe("NOT_SUPPORTED");
      expect(detail.body.compatibility.reasons).toContain("SPECIES_UNSUPPORTED");

      const slot = await firstAvailableServiceSlot(client, service.id);
      const denied = await client
        .post("/booking-holds")
        .send({ petId: cat.body.id, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(400);
      expect(denied.body.error.code).toBe("PET_NOT_SUPPORTED");
    });

    it("reports NEEDS_REVIEW (not a hard block) when a required Care Profile is incomplete", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { service } = await seedServiceProvider(ServiceCategory.TRAINING, { requiresCareProfile: true });

      const detail = await client.get(`/provider-services/${service.id}?petId=${petId}`).expect(200);
      expect(detail.body.compatibility.status).toBe("NEEDS_REVIEW");
      expect(detail.body.compatibility.reasons).toContain("CARE_PROFILE_REQUIRED");
    });

    it("reuses the same deterministic slot generator for a non-vet service", async () => {
      const { client } = await setupOwnerWithPet();
      const { service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const res = await client.get(`/provider-services/${service.id}/availability?from=${from}&to=${to}`).expect(200);
      expect(res.body.slots.length).toBeGreaterThan(0);
      expect(res.body.slots.some((s: { state: string }) => s.state === "AVAILABLE")).toBe(true);
    });

    it("holds, confirms, and grants a category-specific temporary access (Care Profile only, no health) for a Grooming booking", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, staffUser } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);
      expect(booking.body.bookingStatus).toBe("CONFIRMED");
      expect(booking.body.category).toBe("GROOMING");
      expect(booking.body.petAccess.scopePreset).toBe("GROOMING_BASIC");

      const grant = await prisma.petAccessGrant.findFirst({ where: { petId, userId: staffUser.id, source: PetAccessSource.TEMPORARY } });
      expect(grant).not.toBeNull();
      expect(grant?.canViewCareProfile).toBe(true);
      expect(grant?.canViewHealth).toBe(false);

      const groomerClient = authedRequest(app, await signUp(app, logSpy, staffUser.email!));
      await groomerClient.get(`/pets/${petId}/care-profile`).expect(200);
      await groomerClient.get(`/pets/${petId}/health/summary`).expect(403);

      return { booking, groomerClient, petId };
    });

    it("does not overwrite the household's own standing grant when a service access grant is created", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const before = await prisma.petAccessGrant.findMany({ where: { petId, source: PetAccessSource.HOUSEHOLD } });
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const after = await prisma.petAccessGrant.findMany({ where: { petId, source: PetAccessSource.HOUSEHOLD } });
      expect(after.map((g) => g.id).sort()).toEqual(before.map((g) => g.id).sort());
      expect(after[0]?.canViewHealth).toBe(before[0]?.canViewHealth);
    });

    it("revokes a service's temporary access grant once its booking is cancelled, and stops authorizing once expired", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service, staffUser } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const groomerClient = authedRequest(app, await signUp(app, logSpy, staffUser.email!));
      await groomerClient.get(`/pets/${petId}/care-profile`).expect(200);

      await client.post(`/bookings/${booking.body.id}/cancel`).send({}).expect(201);
      await groomerClient.get(`/pets/${petId}/care-profile`).expect(403);

      // Expiry also works independently of cancellation — confirmed by the Handoff 03 "stops
      // authorizing once expired" test on the vet flow, which exercises the same shared
      // grant-expiry mechanism (isGrantActive), so it is not duplicated per category here.
    });

    it("denies a booking hold for a service when the user has no access to the pet (IDOR)", async () => {
      const { client, householdId } = await setupOwnerWithPet();
      const pet = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Rex2", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      const stranger = authedRequest(app, await signUp(app, logSpy, `stranger-${unique()}@example.com`));
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);

      const denied = await stranger
        .post("/booking-holds")
        .send({ petId: pet.body.id, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("My Bookings isolates by household/user and supports the cancelled filter", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const other = authedRequest(app, await signUp(app, logSpy, `other-owner-${unique()}@example.com`));
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const otherList = await other.get("/bookings").expect(200);
      expect(otherList.body.map((b: { id: string }) => b.id)).not.toContain(booking.body.id);

      const upcoming = await client.get("/bookings?upcoming=true").expect(200);
      expect(upcoming.body.map((b: { id: string }) => b.id)).toContain(booking.body.id);

      await client.post(`/bookings/${booking.body.id}/cancel`).send({}).expect(201);
      const cancelled = await client.get("/bookings?cancelled=true").expect(200);
      expect(cancelled.body.map((b: { id: string }) => b.id)).toContain(booking.body.id);
      const upcomingAfterCancel = await client.get("/bookings?upcoming=true").expect(200);
      expect(upcomingAfterCancel.body.map((b: { id: string }) => b.id)).not.toContain(booking.body.id);
    });

    it("surfaces an upcoming non-vet service booking on Home with a category-specific label", async () => {
      const { client, petId } = await setupOwnerWithPet();
      await client.patch(`/pets/${petId}/health/profile`).send({
        allergiesOverallState: "NONE_KNOWN",
        conditionsOverallState: "NONE_KNOWN",
        medicationsOverallState: "NONE_KNOWN",
      });
      await client.put(`/pets/${petId}/health/vaccination-summary`).send({ status: "UP_TO_DATE" });

      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const home = await client.get("/home").expect(200);
      expect(home.body.primaryAction.kind).toBe("VIEW_BOOKING");
      expect(home.body.primaryAction.href).toBe(`/bookings/${booking.body.id}`);
      expect(home.body.primaryAction.labelKey).toBe("home.action.viewBooking.grooming");
    });

    it("projects a confirmed Grooming booking into the Care Calendar as a GROOMING_APPOINTMENT", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const calendar = await client.get(`/care-calendar?petId=${petId}`).expect(200);
      expect(calendar.body.some((e: { type: string }) => e.type === "GROOMING_APPOINTMENT")).toBe(true);
    });

    it("books a multi-day Boarding stay as a date range and projects the exact range into the Care Calendar", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.BOARDING);
      const rangeStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const rangeEnd = new Date(rangeStart.getTime() + 3 * 24 * 60 * 60 * 1000);

      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() })
        .expect(201);
      const booking = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);
      expect(new Date(booking.body.startAt).getTime()).toBe(rangeStart.getTime());
      expect(new Date(booking.body.endAt).getTime()).toBe(rangeEnd.getTime());

      const calendar = await client.get(`/care-calendar?petId=${petId}`).expect(200);
      const event = calendar.body.find((e: { type: string }) => e.type === "BOARDING");
      expect(event).toBeDefined();
      expect(new Date(event.startAt).getTime()).toBe(rangeStart.getTime());
      expect(new Date(event.endAt).getTime()).toBe(rangeEnd.getTime());

      // A second, overlapping Boarding request for the same location must be rejected —
      // the DB-level EXCLUDE constraint (not just this check) is the real guarantee.
      const overlapStart = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
      const overlapEnd = new Date(overlapStart.getTime() + 24 * 60 * 60 * 1000);
      const secondHold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, rangeStart: overlapStart.toISOString(), rangeEnd: overlapEnd.toISOString() })
        .expect(409);
      expect(secondHold.body.error.code).toBe("SLOT_UNAVAILABLE");
    });

    it("creates independent weekly occurrences for a recurring series without one cancellation affecting the others", async () => {
      const { client, petId } = await setupOwnerWithPet();
      const { organization, location, service } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      const origin = await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const series = await client.post(`/bookings/${origin.body.id}/recur`).send({ occurrences: 3 }).expect(201);
      expect(series.body.createdBookingIds.length).toBeGreaterThanOrEqual(1);
      expect(series.body.createdBookingIds).toContain(origin.body.id);

      const occurrences = await prisma.booking.findMany({ where: { bookingSeriesId: series.body.series.id } });
      expect(occurrences.length).toBe(series.body.createdBookingIds.length);

      if (occurrences.length > 1) {
        const secondOccurrence = occurrences.find((o) => o.id !== origin.body.id)!;
        await client.post(`/bookings/${secondOccurrence.id}/cancel`).send({}).expect(201);

        const seriesRow = await prisma.bookingSeries.findUnique({ where: { id: series.body.series.id } });
        expect(seriesRow?.status).toBe("ACTIVE");

        const originAfter = await prisma.booking.findUnique({ where: { id: origin.body.id } });
        expect(originAfter?.bookingStatus).toBe("CONFIRMED");
      }
    });

    it("keeps a second pet's care context fully isolated from a service booking made for the first pet", async () => {
      const { client, householdId, petId } = await setupOwnerWithPet();
      const secondPet = await client
        .post(`/households/${householdId}/pets`)
        .send({ name: "Buddy", species: "DOG", approximateAgeMonths: 36 })
        .expect(201);
      const { organization, location, service, staffUser } = await seedServiceProvider(ServiceCategory.GROOMING);
      const slot = await firstAvailableServiceSlot(client, service.id);
      const hold = await client
        .post("/booking-holds")
        .send({ petId, providerId: organization.id, locationId: location.id, serviceId: service.id, slotStart: slot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);

      const groomerClient = authedRequest(app, await signUp(app, logSpy, staffUser.email!));
      await groomerClient.get(`/pets/${petId}/care-profile`).expect(200);
      await groomerClient.get(`/pets/${secondPet.body.id}/care-profile`).expect(403);

      const bookings = await client.get(`/bookings?petId=${secondPet.body.id}`).expect(200);
      expect(bookings.body).toHaveLength(0);
    });

    it("requires an address only when the service's location mode needs one", async () => {
      const { client, householdId, petId } = await setupOwnerWithPet();
      const atProvider = await seedServiceProvider(ServiceCategory.GROOMING, { locationMode: LocationMode.AT_PROVIDER });
      const atCustomer = await seedServiceProvider(ServiceCategory.WALKING, { locationMode: LocationMode.AT_CUSTOMER });

      const providerSlot = await firstAvailableServiceSlot(client, atProvider.service.id);
      const providerHold = await client
        .post("/booking-holds")
        .send({ petId, providerId: atProvider.organization.id, locationId: atProvider.location.id, serviceId: atProvider.service.id, slotStart: providerSlot.startAt })
        .expect(201);
      await client.post("/bookings").send({ holdId: providerHold.body.holdId, petId }).expect(201);

      const customerSlot = await firstAvailableServiceSlot(client, atCustomer.service.id);
      const customerHold = await client
        .post("/booking-holds")
        .send({ petId, providerId: atCustomer.organization.id, locationId: atCustomer.location.id, serviceId: atCustomer.service.id, slotStart: customerSlot.startAt })
        .expect(201);
      const missingAddress = await client.post("/bookings").send({ holdId: customerHold.body.holdId, petId }).expect(400);
      expect(missingAddress.body.error.code).toBe("ADDRESS_REQUIRED");

      const address = await client
        .post("/addresses")
        .send({ householdId, addressLine: "42 Home St.", city: "Testville", countryCode: "US" })
        .expect(201);

      const customerSlot2 = await firstAvailableServiceSlot(client, atCustomer.service.id);
      const customerHold2 = await client
        .post("/booking-holds")
        .send({ petId, providerId: atCustomer.organization.id, locationId: atCustomer.location.id, serviceId: atCustomer.service.id, slotStart: customerSlot2.startAt })
        .expect(201);
      const withAddress = await client
        .post("/bookings")
        .send({ holdId: customerHold2.body.holdId, petId, customerAddressId: address.body.id })
        .expect(201);
      expect(withAddress.body.customerAddress.id).toBe(address.body.id);
    });
  });

  describe("Minimal Provider OS (Handoff 05)", () => {
    async function setupOwnerWithPet() {
      const identifier = `provideros-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const pet = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Rex", species: "DOG", approximateAgeMonths: 24 })
        .expect(201);
      return { client, householdId: household.body.id, petId: pet.body.id };
    }

    /** A verified GROOMING organization with a single ProviderUser (STAFF by default), open availability every day 00:00-23:30 UTC. */
    async function seedProviderOrg(opts: { verified?: boolean; role?: ProviderUserRole } = {}) {
      const staffUser = await prisma.user.create({ data: { email: `provider-staff-${unique()}@example.com`, displayName: "Groomer Staff" } });
      const organization = await prisma.providerOrganization.create({
        data: { name: `Provider Org ${unique()}`, type: ProviderType.GROOMER, verificationStatus: opts.verified === false ? ProviderVerificationStatus.SUBMITTED : ProviderVerificationStatus.VERIFIED },
      });
      const location = await prisma.providerLocation.create({
        data: { providerOrganizationId: organization.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US", timezone: "UTC" },
      });
      const providerUser = await prisma.providerUser.create({
        data: { userId: staffUser.id, providerOrganizationId: organization.id, role: opts.role ?? ProviderUserRole.STAFF },
      });
      const service = await prisma.providerService.create({
        data: {
          providerOrganizationId: organization.id,
          locationId: location.id,
          name: "Full Groom",
          type: ProviderServiceType.GROOMING_SESSION,
          category: ServiceCategory.GROOMING,
          locationMode: LocationMode.AT_PROVIDER,
          durationMinutes: 60,
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
      return { staffUser, organization, location, providerUser, service };
    }

    async function firstAvailableServiceSlot(client: ReturnType<typeof authedRequest>, serviceId: string) {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const res = await client.get(`/provider-services/${serviceId}/availability?from=${from}&to=${to}`).expect(200);
      const slot = res.body.slots.find((s: { state: string }) => s.state === "AVAILABLE");
      if (!slot) throw new Error("No available slot found in fixture window");
      return slot;
    }

    async function confirmedBooking(owner: ReturnType<typeof authedRequest>, petId: string, org: Awaited<ReturnType<typeof seedProviderOrg>>) {
      const slot = await firstAvailableServiceSlot(owner, org.service.id);
      const hold = await owner
        .post("/booking-holds")
        .send({ petId, providerId: org.organization.id, locationId: org.location.id, serviceId: org.service.id, providerUserId: org.providerUser.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await owner.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);
      return booking.body;
    }

    it("denies Provider OS access to a user with no ProviderUser membership", async () => {
      const client = authedRequest(app, await signUp(app, logSpy, `not-a-provider-${unique()}@example.com`));
      const res = await client.get("/provider/me/overview").expect(403);
      expect(res.body.error.code).toBe("PROVIDER_ACCESS_DENIED");
    });

    it("denies a provider from Organization A access to Organization B's booking", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const orgA = await seedProviderOrg();
      const orgB = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, orgA);

      const providerA = authedRequest(app, await signUp(app, logSpy, orgA.staffUser.email!));
      const providerB = authedRequest(app, await signUp(app, logSpy, orgB.staffUser.email!));

      await providerA.get(`/provider/bookings/${booking.id}`).expect(200);
      const denied = await providerB.get(`/provider/bookings/${booking.id}`).expect(403);
      expect(denied.body.error.code).toBe("PROVIDER_ACCESS_DENIED");
    });

    it("shows a provider only their own organization's bookings in the queue", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const orgA = await seedProviderOrg();
      const orgB = await seedProviderOrg();
      const bookingA = await confirmedBooking(owner, petId, orgA);
      await confirmedBooking(owner, petId, orgB);

      const providerA = authedRequest(app, await signUp(app, logSpy, orgA.staffUser.email!));
      const list = await providerA.get("/provider/bookings").expect(200);
      const ids = list.body.map((b: { id: string }) => b.id);
      expect(ids).toContain(bookingA.id);
      expect(ids).toHaveLength(1);
    });

    it("shows Care context but hides Health context when the booking's grant never included it, and never queries health data at all", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);

      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));
      const detail = await provider.get(`/provider/bookings/${booking.id}`).expect(200);
      expect(detail.body.access.state).toBe("GRANTED");
      expect(detail.body.access.canViewCareProfile).toBe(true);
      expect(detail.body.access.canViewHealth).toBe(false);
      expect(detail.body.careProfile).not.toBeNull();
      expect(detail.body.healthSummary).toBeNull();
    });

    it("shows a clear NO_GRANT state when the viewing provider user was never assigned to the booking", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      // Replace the staff-linked availability rule with an org-wide one (no providerUserId) so
      // the slot generator — and therefore BookingsService.createHold — never assigns a staff
      // member, and grantForBooking's early-return ("no specific provider staff assigned yet")
      // means no PetAccessGrant is created at all for this booking.
      await prisma.providerAvailabilityRule.deleteMany({ where: { providerOrganizationId: org.organization.id } });
      await prisma.providerAvailabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          providerOrganizationId: org.organization.id,
          locationId: org.location.id,
          dayOfWeek,
          startLocalTime: "00:00",
          endLocalTime: "23:30",
          timezone: "UTC",
        })),
      });

      const slot = await firstAvailableServiceSlot(owner, org.service.id);
      const hold = await owner
        .post("/booking-holds")
        .send({ petId, providerId: org.organization.id, locationId: org.location.id, serviceId: org.service.id, slotStart: slot.startAt })
        .expect(201);
      const booking = await owner.post("/bookings").send({ holdId: hold.body.holdId, petId }).expect(201);
      expect(booking.body.providerUserId).toBeNull();

      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));
      const detail = await provider.get(`/provider/bookings/${booking.body.id}`).expect(200);
      expect(detail.body.access.state).toBe("NO_GRANT");
      expect(detail.body.careProfile).toBeNull();
      expect(detail.body.healthSummary).toBeNull();
    });

    it("confirms a booking idempotently (CONFIRMED -> CONFIRMED) and rejects confirming a cancelled booking", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      const confirmed = await provider.post(`/provider/bookings/${booking.id}/confirm`).send({}).expect(201);
      expect(confirmed.body.booking.bookingStatus).toBe("CONFIRMED");

      await owner.post(`/bookings/${booking.id}/cancel`).send({}).expect(201);
      const rejected = await provider.post(`/provider/bookings/${booking.id}/confirm`).send({}).expect(400);
      expect(rejected.body.error.code).toBe("INVALID_BOOKING_TRANSITION");
    });

    it("cancels a booking, revokes its temporary grant, and updates Care Calendar and Home", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      await owner.patch(`/pets/${petId}/health/profile`).send({ allergiesOverallState: "NONE_KNOWN", conditionsOverallState: "NONE_KNOWN", medicationsOverallState: "NONE_KNOWN" });
      await owner.put(`/pets/${petId}/health/vaccination-summary`).send({ status: "UP_TO_DATE" });
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      await provider.get(`/pets/${petId}/care-profile`).expect(200);
      const homeBefore = await owner.get("/home").expect(200);
      expect(homeBefore.body.primaryAction.href).toBe(`/bookings/${booking.id}`);

      const cancelled = await provider.post(`/provider/bookings/${booking.id}/cancel`).send({ reason: "Staff unavailable" }).expect(201);
      expect(cancelled.body.booking.bookingStatus).toBe("CANCELLED_BY_PROVIDER");

      const bookingRow = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(bookingRow?.bookingStatus).toBe(BookingStatus.CANCELLED_BY_PROVIDER);

      await provider.get(`/pets/${petId}/care-profile`).expect(403);

      const calendar = await owner.get(`/care-calendar?petId=${petId}`).expect(200);
      expect(calendar.body.find((e: { bookingId: string }) => e.bookingId === booking.id)).toBeUndefined();

      const homeAfter = await owner.get("/home").expect(200);
      expect(homeAfter.body.primaryAction.href).not.toBe(`/bookings/${booking.id}`);
    });

    it("walks a booking through check-in -> start -> complete, rejecting a skipped transition", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      const skipped = await provider.post(`/provider/bookings/${booking.id}/start`).send({}).expect(400);
      expect(skipped.body.error.code).toBe("INVALID_BOOKING_TRANSITION");

      const checkedIn = await provider.post(`/provider/bookings/${booking.id}/check-in`).send({}).expect(201);
      expect(checkedIn.body.booking.bookingStatus).toBe("CHECKED_IN");

      const started = await provider.post(`/provider/bookings/${booking.id}/start`).send({}).expect(201);
      expect(started.body.booking.bookingStatus).toBe("IN_PROGRESS");

      const completed = await provider
        .post(`/provider/bookings/${booking.id}/complete`)
        .send({ completionNote: "Rex's grooming was completed." })
        .expect(201);
      expect(completed.body.booking.bookingStatus).toBe("COMPLETED");
      expect(completed.body.booking.completionNote).toBe("Rex's grooming was completed.");
      expect(completed.body.booking.completedByProviderUserId).toBe(org.providerUser.id);

      const ownerView = await owner.get(`/bookings/${booking.id}`).expect(200);
      expect(ownerView.body.completionNote).toBe("Rex's grooming was completed.");

      const stillCompleted = await provider.post(`/provider/bookings/${booking.id}/check-in`).send({}).expect(400);
      expect(stillCompleted.body.error.code).toBe("INVALID_BOOKING_TRANSITION");
    });

    it("creates, updates, and deletes an availability rule", async () => {
      const org = await seedProviderOrg();
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      const created = await provider
        .post("/provider/availability/rules")
        .send({ locationId: org.location.id, dayOfWeek: 1, startLocalTime: "09:00", endLocalTime: "17:00", timezone: "UTC" })
        .expect(201);
      expect(created.body.dayOfWeek).toBe(1);

      const updated = await provider.patch(`/provider/availability/rules/${created.body.id}`).send({ endLocalTime: "18:00" }).expect(200);
      expect(updated.body.endLocalTime).toBe("18:00");

      await provider.delete(`/provider/availability/rules/${created.body.id}`).expect(200);
      const list = await provider.get("/provider/availability/rules").expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).not.toContain(created.body.id);
    });

    it("requires explicit acknowledgement before a blocked exception overlapping a confirmed booking is created, and never touches the booking itself", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      const conflict = await provider
        .post("/provider/availability/exceptions")
        .send({ locationId: org.location.id, startAt: booking.startAt, endAt: booking.endAt, type: AvailabilityExceptionType.BLOCKED, reason: "Closed" })
        .expect(409);
      expect(conflict.body.error.code).toBe("AVAILABILITY_CONFLICT");

      const bookingUnchanged = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(bookingUnchanged?.bookingStatus).toBe("CONFIRMED");

      const acknowledged = await provider
        .post("/provider/availability/exceptions")
        .send({ locationId: org.location.id, startAt: booking.startAt, endAt: booking.endAt, type: AvailabilityExceptionType.BLOCKED, reason: "Closed", acknowledgeConflict: true })
        .expect(201);
      expect(acknowledged.body.type).toBe("BLOCKED");

      const bookingStillConfirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(bookingStillConfirmed?.bookingStatus).toBe("CONFIRMED");
    });

    it("disabling a service blocks new bookings but leaves existing confirmed bookings untouched, and is OWNER-only", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg({ role: ProviderUserRole.OWNER });
      const booking = await confirmedBooking(owner, petId, org);
      const provider = authedRequest(app, await signUp(app, logSpy, org.staffUser.email!));

      const staffUser = await prisma.user.create({ data: { email: `other-staff-${unique()}@example.com`, displayName: "Other Staff" } });
      await prisma.providerUser.create({ data: { userId: staffUser.id, providerOrganizationId: org.organization.id, role: ProviderUserRole.STAFF } });
      const staffProvider = authedRequest(app, await signUp(app, logSpy, staffUser.email!));
      const staffDenied = await staffProvider.patch(`/provider/services/${org.service.id}`).send({ isActive: false }).expect(403);
      expect(staffDenied.body.error.code).toBe("PROVIDER_ACCESS_DENIED");

      await provider.patch(`/provider/services/${org.service.id}`).send({ isActive: false }).expect(200);

      const stillThere = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stillThere?.bookingStatus).toBe("CONFIRMED");

      const slot = await firstAvailableServiceSlot(owner, org.service.id);
      const denied = await owner
        .post("/booking-holds")
        .send({ petId, providerId: org.organization.id, locationId: org.location.id, serviceId: org.service.id, slotStart: slot.startAt })
        .expect(400);
      expect(denied.body.error.code).toBe("SERVICE_NOT_AVAILABLE");
    });

    it("isolates the team roster per organization", async () => {
      const orgA = await seedProviderOrg();
      const orgB = await seedProviderOrg();
      const providerA = authedRequest(app, await signUp(app, logSpy, orgA.staffUser.email!));

      const team = await providerA.get("/provider/team").expect(200);
      const ids = team.body.map((m: { providerUserId: string }) => m.providerUserId);
      expect(ids).toContain(orgA.providerUser.id);
      expect(ids).not.toContain(orgB.providerUser.id);
    });

    it("requires an explicit organization choice for a user with more than one provider membership, then honors it", async () => {
      const orgA = await seedProviderOrg();
      const orgB = await seedProviderOrg();
      const multiUser = await prisma.user.create({ data: { email: `multi-provider-${unique()}@example.com`, displayName: "Multi Org Provider" } });
      await prisma.providerUser.create({ data: { userId: multiUser.id, providerOrganizationId: orgA.organization.id, role: ProviderUserRole.STAFF } });
      await prisma.providerUser.create({ data: { userId: multiUser.id, providerOrganizationId: orgB.organization.id, role: ProviderUserRole.STAFF } });

      const client = authedRequest(app, await signUp(app, logSpy, multiUser.email!));
      const ambiguous = await client.get("/provider/me/overview").expect(403);
      expect(ambiguous.body.error.code).toBe("PROVIDER_ACCESS_DENIED");
      expect(ambiguous.body.error.details.reason).toBe("AMBIGUOUS_CONTEXT");

      const context = await client.get("/provider/me/context").expect(200);
      expect(context.body.active).toBeNull();
      expect(context.body.memberships).toHaveLength(2);

      await client.put("/provider/me/context").send({ providerOrganizationId: orgA.organization.id }).expect(200);
      const overview = await client.get("/provider/me/overview").expect(200);
      expect(overview.body.organization.id).toBe(orgA.organization.id);
    });

    it("returns the same canonical ISO timestamps regardless of the viewing provider's locale (fa vs en)", async () => {
      const { client: owner, petId } = await setupOwnerWithPet();
      const org = await seedProviderOrg();
      const booking = await confirmedBooking(owner, petId, org);

      const faProviderEmail = org.staffUser.email!;
      const faClient = authedRequest(app, await signUp(app, logSpy, faProviderEmail));
      await prisma.user.update({ where: { id: org.staffUser.id }, data: { locale: "fa" } });

      const detail = await faClient.get(`/provider/bookings/${booking.id}`).expect(200);
      expect(detail.body.booking.startAt).toBe(booking.startAt);
      expect(new Date(detail.body.booking.startAt).toISOString()).toBe(detail.body.booking.startAt);
    });
  });

  describe("Commerce Core (Handoff 06)", () => {
    async function setupOwnerWithPets() {
      const identifier = `commerce-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const dog = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Rex", species: "DOG", approximateAgeMonths: 36 })
        .expect(201);
      const cat = await client
        .post(`/households/${household.body.id}/pets`)
        .send({ name: "Whiskers", species: "CAT", approximateAgeMonths: 18 })
        .expect(201);
      return { client, householdId: household.body.id, dogId: dog.body.id, catId: cat.body.id };
    }

    async function seedCategory() {
      return prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
    }

    async function seedProduct(opts: {
      supportsDog?: boolean;
      supportsCat?: boolean;
      minAgeMonths?: number;
      maxAgeMonths?: number;
      allergenTags?: string[];
      requiresHealthReview?: boolean;
    } = {}) {
      const category = await seedCategory();
      const product = await prisma.product.create({
        data: {
          categoryId: category.id,
          title: `Test Product ${unique()}`,
          slug: `test-product-${unique()}`,
          supportsDog: opts.supportsDog ?? true,
          supportsCat: opts.supportsCat ?? true,
          minAgeMonths: opts.minAgeMonths,
          maxAgeMonths: opts.maxAgeMonths,
          allergenTags: opts.allergenTags ?? [],
          requiresHealthReview: opts.requiresHealthReview ?? false,
        },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
      return { product, variant };
    }

    async function seedSeller(verified = true) {
      return prisma.sellerOrganization.create({
        data: {
          name: `Seller ${unique()}`,
          verificationStatus: verified ? SellerVerificationStatus.VERIFIED : SellerVerificationStatus.SUBMITTED,
          status: SellerStatus.ACTIVE,
          countryCode: "US",
        },
      });
    }

    async function seedOffer(sellerId: string, variantId: string, priceAmount: number, onHand: number) {
      const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variantId, priceAmount, currency: "IRR" } });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
      return offer;
    }

    async function seedAddress(client: ReturnType<typeof authedRequest>, householdId: string) {
      const res = await client.post("/addresses").send({ householdId, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      return res.body.id as string;
    }

    it("returns Product -> Variant -> Offer as distinct objects from discovery", async () => {
      const { client, dogId } = await setupOwnerWithPets();
      const { product, variant } = await seedProduct();
      const seller = await seedSeller();
      await seedOffer(seller.id, variant.id, 100_000, 10);

      const detail = await client.get(`/shop/products/${product.id}?petId=${dogId}`).expect(200);
      expect(detail.body.id).toBe(product.id);
      expect(detail.body.variants[0].id).toBe(variant.id);
      expect(detail.body.offers[0].productVariantId).toBe(variant.id);
      expect(detail.body.offers[0].sellerOrganization.id).toBe(seller.id);
    });

    it("never surfaces an unverified seller's offer, and rejects adding it to a cart", async () => {
      const { client } = await setupOwnerWithPets();
      const { product, variant } = await seedProduct();
      const unverifiedSeller = await seedSeller(false);
      const offer = await seedOffer(unverifiedSeller.id, variant.id, 100_000, 10);

      const results = await client.get(`/shop/products?search=${encodeURIComponent(product.title)}`).expect(200);
      const found = results.body.find((p: { id: string }) => p.id === product.id);
      expect(found.bestOffer).toBeNull();

      const denied = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(400);
      expect(denied.body.error.code).toBe("OFFER_NOT_AVAILABLE");
    });

    it("enforces inventory constraints at the database level", async () => {
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 5);

      await expect(prisma.inventoryItem.update({ where: { sellerOfferId: offer.id }, data: { reserved: 6 } })).rejects.toThrow();
      await expect(prisma.inventoryItem.update({ where: { sellerOfferId: offer.id }, data: { onHand: -1 } })).rejects.toThrow();
    });

    it("evaluates deterministic pet compatibility: species mismatch, unrestricted product, and health-review gating", async () => {
      const { client, dogId, catId } = await setupOwnerWithPets();
      const { product: dogOnlyFood } = await seedProduct({ supportsDog: true, supportsCat: false });
      const { product: unrestricted } = await seedProduct();
      const { product: needsReview } = await seedProduct({ requiresHealthReview: true });

      const catDetail = await client.get(`/shop/products/${dogOnlyFood.id}?petId=${catId}`).expect(200);
      expect(catDetail.body.compatibility.status).toBe("NOT_RECOMMENDED");
      expect(catDetail.body.compatibility.reasons).toContain("SPECIES_MISMATCH");

      const unrestrictedDetail = await client.get(`/shop/products/${unrestricted.id}?petId=${dogId}`).expect(200);
      expect(unrestrictedDetail.body.compatibility.status).toBe("LIKELY_COMPATIBLE");

      const reviewDetail = await client.get(`/shop/products/${needsReview.id}?petId=${dogId}`).expect(200);
      expect(reviewDetail.body.compatibility.status).toBe("NEEDS_REVIEW");
      expect(reviewDetail.body.compatibility.reasons).toContain("HEALTH_REVIEW_REQUIRED");
    });

    it("keeps target-pet compatibility fully isolated between two pets in the same household", async () => {
      const { client, dogId, catId } = await setupOwnerWithPets();
      const { variant } = await seedProduct({ supportsDog: true, supportsCat: false });
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      const cart = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1, targetPetId: dogId }).expect(201);
      const dogLine = cart.body.sellerGroups[0].lines[0];
      expect(dogLine.compatibility.status).not.toBe("NOT_RECOMMENDED");

      await client.delete(`/cart/items/${dogLine.id}`).expect(200);
      const catCart = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1, targetPetId: catId }).expect(201);
      const catLine = catCart.body.sellerGroups[0].lines[0];
      expect(catLine.compatibility.status).toBe("NOT_RECOMMENDED");
      expect(catLine.compatibility.reasons).toContain("SPECIES_MISMATCH");
    });

    it("denies targeting a pet the caller has no access to (IDOR)", async () => {
      const { client } = await setupOwnerWithPets();
      const stranger = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      const denied = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1, targetPetId: stranger.dogId }).expect(403);
      expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
    });

    it("adds, updates, and removes a cart line", async () => {
      const { client } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      const added = await client.post("/cart/items").send({ offerId: offer.id, quantity: 2 }).expect(201);
      const line = added.body.sellerGroups[0].lines[0];
      expect(line.quantity).toBe(2);
      expect(line.lineTotal).toBe(200_000);

      const updated = await client.patch(`/cart/items/${line.id}`).send({ quantity: 5 }).expect(200);
      expect(updated.body.sellerGroups[0].lines[0].quantity).toBe(5);

      const removed = await client.delete(`/cart/items/${line.id}`).expect(200);
      expect(removed.body.sellerGroups).toHaveLength(0);
    });

    it("groups a multi-seller cart by seller, one group per seller", async () => {
      const { client } = await setupOwnerWithPets();
      const { variant: variantA } = await seedProduct();
      const { variant: variantB } = await seedProduct();
      const sellerA = await seedSeller();
      const sellerB = await seedSeller();
      const offerA = await seedOffer(sellerA.id, variantA.id, 100_000, 10);
      const offerB = await seedOffer(sellerB.id, variantB.id, 200_000, 10);

      await client.post("/cart/items").send({ offerId: offerA.id, quantity: 1 }).expect(201);
      const cart = await client.post("/cart/items").send({ offerId: offerB.id, quantity: 1 }).expect(201);

      expect(cart.body.sellerGroups).toHaveLength(2);
      const sellerIds = cart.body.sellerGroups.map((g: { sellerOrganization: { id: string } }) => g.sellerOrganization.id).sort();
      expect(sellerIds).toEqual([sellerA.id, sellerB.id].sort());
    });

    it("flags a price change since the item was added, without trusting the stale snapshot for the total", async () => {
      const { client } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      const added = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const lineId = added.body.sellerGroups[0].lines[0].id;

      await prisma.sellerOffer.update({ where: { id: offer.id }, data: { priceAmount: 150_000 } });

      const cart = await client.get("/cart").expect(200);
      const line = cart.body.sellerGroups[0].lines.find((l: { id: string }) => l.id === lineId);
      expect(line.priceChanged).toBe(true);
      expect(line.currentPriceAmount).toBe(150_000);
      expect(line.lineTotal).toBe(150_000);

      const checkout = await client.post("/checkout").send({}).expect(201);
      expect(checkout.body.validationIssues.some((i: { code: string }) => i.code === "PRICE_CHANGED")).toBe(true);
      expect(checkout.body.subtotalAmount).toBe(150_000);
    });

    it("rejects checkout creation when the requested quantity exceeds available inventory", async () => {
      const { client } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 2);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 5 }).expect(201);
      const denied = await client.post("/checkout").send({}).expect(400);
      expect(denied.body.error.details.reason).toBe("INSUFFICIENT_INVENTORY");
    });

    it("creates an inventory reservation transactionally when a checkout is created", async () => {
      const { client } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 3 }).expect(201);
      const checkout = await client.post("/checkout").send({}).expect(201);

      const inventory = await prisma.inventoryItem.findUnique({ where: { sellerOfferId: offer.id } });
      expect(inventory?.reserved).toBe(3);
      const reservation = await prisma.inventoryReservation.findFirst({ where: { checkoutId: checkout.body.id, sellerOfferId: offer.id } });
      expect(reservation?.status).toBe("ACTIVE");
      expect(reservation?.quantity).toBe(3);
    });

    it("rejects paying an expired checkout and releases its reservation", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 2 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);

      await prisma.checkout.update({ where: { id: checkout.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const denied = await client.post(`/checkout/${checkout.body.id}/pay`).send({}).expect(410);
      expect(denied.body.error.code).toBe("CHECKOUT_EXPIRED");

      const inventory = await prisma.inventoryItem.findUnique({ where: { sellerOfferId: offer.id } });
      expect(inventory?.reserved).toBe(0);
    });

    it("confirms a checkout on a successful simulated payment", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      expect(paid.body.paymentStatus).toBe("SUCCEEDED");
      expect(paid.body.checkout.status).toBe("CONFIRMED");
      expect(paid.body.orderIds).toHaveLength(1);
    });

    it("preserves the cart and reservation on a simulated payment failure, and allows a successful retry", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);

      const failed = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "FAILURE" }).expect(201);
      expect(failed.body.paymentStatus).toBe("FAILED");
      expect(failed.body.checkout.status).not.toBe("CONFIRMED");
      expect(failed.body.orderIds).toHaveLength(0);

      const cartRow = await prisma.cart.findFirst({ where: { userId: (await prisma.checkout.findUnique({ where: { id: checkout.body.id } }))!.userId } });
      expect(cartRow?.status).toBe(CartStatus.ACTIVE);
      const inventory = await prisma.inventoryItem.findUnique({ where: { sellerOfferId: offer.id } });
      expect(inventory?.reserved).toBe(1);

      const retried = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      expect(retried.body.paymentStatus).toBe("SUCCEEDED");
      expect(retried.body.orderIds).toHaveLength(1);
    });

    it("does not confirm an order while payment is pending, then confirms it once a webhook resolves the intent", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 1);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const pending = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "PENDING" }).expect(201);
      expect(pending.body.paymentStatus).toBe("PENDING");
      expect(pending.body.checkout.status).toBe("PAYMENT_PENDING");

      const ordersDuringPending = await prisma.order.findMany({ where: { checkoutId: checkout.body.id } });
      expect(ordersDuringPending).toHaveLength(0);

      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId: checkout.body.id } });
      await request(app.getHttpServer())
        .post("/payments/webhooks/dev_simulated")
        .send({ paymentIntentId: intent.id, eventId: `evt_${unique()}`, status: "SUCCEEDED" })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 100));
      const ordersAfterWebhook = await prisma.order.findMany({ where: { checkoutId: checkout.body.id } });
      expect(ordersAfterWebhook).toHaveLength(1);
      const checkoutAfter = await prisma.checkout.findUnique({ where: { id: checkout.body.id } });
      expect(checkoutAfter?.status).toBe(CheckoutStatus.CONFIRMED);
    });

    it("creates one Order per seller for a single multi-seller Checkout", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant: variantA } = await seedProduct();
      const { variant: variantB } = await seedProduct();
      const sellerA = await seedSeller();
      const sellerB = await seedSeller();
      const offerA = await seedOffer(sellerA.id, variantA.id, 100_000, 10);
      const offerB = await seedOffer(sellerB.id, variantB.id, 200_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offerA.id, quantity: 1 }).expect(201);
      await client.post("/cart/items").send({ offerId: offerB.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      expect(paid.body.orderIds).toHaveLength(2);
      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.body.id } });
      expect(orders.map((o) => o.sellerOrganizationId).sort()).toEqual([sellerA.id, sellerB.id].sort());
      for (const order of orders) expect(order.status).toBe(OrderStatus.CONFIRMED);
    });

    it("preserves an immutable commercial snapshot on the Order even after the Product/Offer later change", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { product, variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const orderId = paid.body.orderIds[0];

      await prisma.product.update({ where: { id: product.id }, data: { title: "Renamed Later" } });
      await prisma.sellerOffer.update({ where: { id: offer.id }, data: { priceAmount: 999_999 } });

      const orderDetail = await client.get(`/orders/${orderId}`).expect(200);
      expect(orderDetail.body.items[0].productTitleSnapshot).toBe(product.title);
      expect(orderDetail.body.items[0].unitPrice).toBe(100_000);
    });

    it("consumes inventory exactly once even if the same checkout's pay endpoint is called again", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 3 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      const afterFirst = await prisma.inventoryItem.findUnique({ where: { sellerOfferId: offer.id } });
      expect(afterFirst?.onHand).toBe(7);
      expect(afterFirst?.reserved).toBe(0);

      const retried = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(409);
      expect(retried.body.error.code).toBe("PAYMENT_ALREADY_COMPLETED");

      const afterSecond = await prisma.inventoryItem.findUnique({ where: { sellerOfferId: offer.id } });
      expect(afterSecond?.onHand).toBe(7);
      expect(afterSecond?.reserved).toBe(0);

      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.body.id } });
      expect(orders).toHaveLength(1);
    });

    it("denies a user from reading another user's order", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const stranger = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      const denied = await stranger.client.get(`/orders/${paid.body.orderIds[0]}`).expect(404);
      expect(denied.body.error.code).toBe("ORDER_NOT_FOUND");
    });

    it("keeps every commerce amount a plain integer, never a fractional IRR value", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 123_456, 10);
      const addressId = await seedAddress(client, householdId);

      const cart = await client.post("/cart/items").send({ offerId: offer.id, quantity: 3 }).expect(201);
      expect(Number.isInteger(cart.body.sellerGroups[0].lines[0].lineTotal)).toBe(true);
      expect(Number.isInteger(cart.body.subtotalAmount)).toBe(true);

      const checkout = await client.post("/checkout").send({ addressId }).expect(201);
      expect(Number.isInteger(checkout.body.totalAmount)).toBe(true);
      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const order = await client.get(`/orders/${paid.body.orderIds[0]}`).expect(200);
      expect(Number.isInteger(order.body.totalAmount)).toBe(true);
      expect(Number.isInteger(order.body.items[0].unitPrice)).toBe(true);
    });

    it("surfaces a potential safety conflict and blocks checkout until explicitly acknowledged", async () => {
      const { client, dogId } = await setupOwnerWithPets();
      const { variant } = await seedProduct({ allergenTags: ["CHICKEN"] });
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);

      await client.post(`/pets/${dogId}/health/allergies`).send({ name: "Chicken" }).expect(201);

      const cart = await client.post("/cart/items").send({ offerId: offer.id, quantity: 1, targetPetId: dogId }).expect(201);
      const line = cart.body.sellerGroups[0].lines[0];
      expect(line.compatibility.status).toBe("POTENTIAL_SAFETY_CONFLICT");
      expect(line.compatibility.reasons).toContain("ALLERGEN_CONFLICT");

      const blocked = await client.post("/checkout").send({}).expect(400);
      expect(blocked.body.error.code).toBe("SAFETY_CONFLICT");

      const acknowledged = await client.post("/checkout").send({ acknowledgeSafetyConflict: true }).expect(201);
      expect(acknowledged.body.id).toBeDefined();
    });

    it("converts the cart only once payment is confirmed, never at checkout creation", async () => {
      const { client, householdId } = await setupOwnerWithPets();
      const { variant } = await seedProduct();
      const seller = await seedSeller();
      const offer = await seedOffer(seller.id, variant.id, 100_000, 10);
      const addressId = await seedAddress(client, householdId);

      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId }).expect(201);

      const userId = (await prisma.checkout.findUnique({ where: { id: checkout.body.id } }))!.userId;
      const cartBefore = await prisma.cart.findFirst({ where: { userId } });
      expect(cartBefore?.status).toBe(CartStatus.ACTIVE);

      await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      const cartAfter = await prisma.cart.findFirst({ where: { id: cartBefore!.id } });
      expect(cartAfter?.status).toBe(CartStatus.CONVERTED);
    });
  });

  describe("Real Payments + BNPL + Refund Basics + Reconciliation (Handoff 07)", () => {
    async function setupCheckoutReady(priceAmount = 1_000_000, onHand = 10) {
      const identifier = `payments-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const product = await prisma.product.create({
        data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
      const seller = await prisma.sellerOrganization.create({
        data: { name: `Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US" },
      });
      const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount, currency: "IRR" } });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
      const addressRes = await client.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
      return { client, checkout: checkout.body as { id: string; totalAmount: number }, offer, seller };
    }

    it("lists only enabled payment methods, capability-driven, and never an unsupported provider", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const options = await client.get(`/checkout/${checkout.id}/payment-options`).expect(200);

      const online = options.body.filter((o: { methodType: string }) => o.methodType === "ONLINE_PAYMENT").map((o: { provider: string }) => o.provider);
      const installments = options.body.filter((o: { methodType: string }) => o.methodType === "INSTALLMENTS").map((o: { provider: string }) => o.provider);
      expect(online.sort()).toEqual(["DEV_SIMULATED", "STANDARD_GATEWAY"].sort());
      expect(installments.sort()).toEqual(["DIGI_PAY", "SNAPP_PAY"].sort());

      const snapp = options.body.find((o: { provider: string }) => o.provider === "SNAPP_PAY");
      expect(snapp.capabilities.supportsEligibilityCheck).toBe(true);
      const digi = options.body.find((o: { provider: string }) => o.provider === "DIGI_PAY");
      expect(digi.capabilities.supportsEligibilityCheck).toBe(false);
    });

    it("confirms a checkout paid through the STANDARD_GATEWAY provider, chosen via the adapter registry rather than hard-coded", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intent = await client.post(`/checkout/${checkout.id}/payment-intent`).send({ provider: "STANDARD_GATEWAY" }).expect(201);
      expect(intent.body.provider).toBe("STANDARD_GATEWAY");

      const paid = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      expect(paid.body.paymentStatus).toBe("SUCCEEDED");
      expect(paid.body.checkout.status).toBe("CONFIRMED");
    });

    it("never confirms an order from the callback endpoint alone — it is a read-only UX signal", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({ provider: "STANDARD_GATEWAY" }).expect(201);
      const pending = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "PENDING" }).expect(201);
      expect(pending.body.paymentStatus).toBe("PENDING");

      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId: checkout.id } });
      const callback = await request(app.getHttpServer()).get(`/payments/callback/standard_gateway?paymentIntentId=${intent.id}`).expect(200);
      expect(callback.body.status).toBe("PENDING");

      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.id } });
      expect(orders).toHaveLength(0);
      const checkoutRow = await prisma.checkout.findUnique({ where: { id: checkout.id } });
      expect(checkoutRow?.status).toBe(CheckoutStatus.PAYMENT_PENDING);
    });

    it("acknowledges a duplicate webhook delivery without creating a second order, transaction, or ledger entry", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "PENDING" }).expect(201);
      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId: checkout.id } });
      const eventId = `evt_${unique()}`;

      const first = await request(app.getHttpServer())
        .post("/payments/webhooks/dev_simulated")
        .send({ paymentIntentId: intent.id, eventId, status: "SUCCEEDED" })
        .expect(201);
      expect(first.body.processed).toBe(true);
      // resolvePendingIntent's own order-confirmation is driven by an
      // async, fire-and-forget domain-event listener (PaymentEventsListener,
      // same pattern as the Handoff 06 "resolves a pending intent" test) —
      // poll for it to finish before asserting on Order/Ledger state.
      await pollUntil(
        () => prisma.order.findMany({ where: { checkoutId: checkout.id } }),
        (orders) => orders.length > 0,
      );

      const second = await request(app.getHttpServer())
        .post("/payments/webhooks/dev_simulated")
        .send({ paymentIntentId: intent.id, eventId, status: "SUCCEEDED" })
        .expect(201);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.processed).toBe(false);

      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.id } });
      expect(orders).toHaveLength(1);
      const events = await pollUntil(
        () => prisma.paymentProviderEvent.findMany({ where: { paymentIntentId: intent.id } }),
        (rows) => (rows[0]?.attemptCount ?? 0) >= 1,
      );
      expect(events).toHaveLength(1);
      // attemptCount defaults to 0 on creation; one duplicate delivery increments it once.
      expect(events[0]?.attemptCount).toBe(1);
      const ledgerTx = await prisma.ledgerTransaction.findMany({ where: { referenceType: "PAYMENT", referenceId: checkout.id } });
      expect(ledgerTx).toHaveLength(1);
    });

    it("rejects an invalid webhook signature once a secret is configured, and accepts a correctly-signed one", async () => {
      // StandardGatewayAdapter's `secret` field is fixed at construction
      // from STANDARD_GATEWAY_API_KEY (mirroring how a real provider client
      // is configured once at boot), so exercising this needs a fresh
      // instance built with the env var already set — not a second live
      // NestJS application sharing this test file's Postgres/Redis
      // connections and event bus for the duration of one assertion. This
      // still genuinely exercises the real HMAC verification mechanism
      // (see the adapter's own doc comment), just without the unrelated
      // cost/risk of standing up a whole second app mid-suite.
      process.env.STANDARD_GATEWAY_API_KEY = "test-secret";
      try {
        const { StandardGatewayAdapter: FreshStandardGatewayAdapter } = await import("../src/modules/commerce/payments/standard-gateway.adapter");
        const adapter = new FreshStandardGatewayAdapter();
        const payload = { paymentIntentId: "intent-1", eventId: "evt-1", status: "SUCCEEDED" };

        expect(adapter.verifyWebhookSignature(payload, "not-the-right-signature")).toBe(false);
        expect(adapter.verifyWebhookSignature(payload, undefined)).toBe(false);

        const correctSignature = createHmac("sha256", "test-secret").update(JSON.stringify(payload)).digest("hex");
        expect(adapter.verifyWebhookSignature(payload, correctSignature)).toBe(true);
      } finally {
        delete process.env.STANDARD_GATEWAY_API_KEY;
      }
    });

    it("walks a full BNPL flow to APPROVED, confirming Orders and recording balanced ledger entries", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "SNAPP_PAY" }).expect(201);
      expect(intentRes.body.status).toBe("CREATED");

      const eligibility = await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/eligibility`).send({}).expect(201);
      expect(eligibility.body.status).toBe("ELIGIBLE");

      const plans = await client.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/plans`).expect(200);
      expect(plans.body.length).toBeGreaterThan(0);
      expect(plans.body[0].totalPayableAmount).toBeGreaterThan(checkout.totalAmount);
      expect(Number.isInteger(plans.body[0].totalPayableAmount)).toBe(true);

      const selected = await client
        .post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/select-plan`)
        .send({ providerPlanId: plans.body[0].providerPlanId })
        .expect(201);
      expect(selected.body.status).toBe("PLAN_SELECTED");
      expect(selected.body.selectedPlan.providerPlanId).toBe(plans.body[0].providerPlanId);

      const authorized = await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/authorize`).send({ mode: "APPROVE" }).expect(201);
      expect(authorized.body.paymentStatus).toBe("SUCCEEDED");
      expect(authorized.body.orderIds).toHaveLength(1);
      expect(authorized.body.checkout.status).toBe("CONFIRMED");

      const financingRow = await prisma.financingIntent.findUniqueOrThrow({ where: { id: intentRes.body.id } });
      expect(financingRow.status).toBe(FinancingIntentStatus.APPROVED);

      const ledgerTx = await prisma.ledgerTransaction.findFirstOrThrow({ where: { referenceType: "PAYMENT", referenceId: checkout.id }, include: { entries: true } });
      const debits = ledgerTx.entries.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
      const credits = ledgerTx.entries.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
      expect(debits).toBe(credits);
      expect(debits).toBe(checkout.totalAmount);
    });

    it("declines an installment authorization without confirming Orders, leaving the checkout recoverable", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "SNAPP_PAY" }).expect(201);
      const plans = await client.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/plans`).expect(200);
      await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/select-plan`).send({ providerPlanId: plans.body[0].providerPlanId }).expect(201);

      const declined = await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/authorize`).send({ mode: "DECLINE" }).expect(201);
      expect(declined.body.paymentStatus).toBe("FAILED");
      expect(declined.body.orderIds).toHaveLength(0);
      expect(declined.body.checkout.status).not.toBe("CONFIRMED");

      const financingRow = await prisma.financingIntent.findUniqueOrThrow({ where: { id: intentRes.body.id } });
      expect(financingRow.status).toBe(FinancingIntentStatus.DECLINED);
      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.id } });
      expect(orders).toHaveLength(0);
    });

    it("recovers a declined installment checkout by switching to online payment on the very same checkout", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "SNAPP_PAY" }).expect(201);
      const plans = await client.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/plans`).expect(200);
      await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/select-plan`).send({ providerPlanId: plans.body[0].providerPlanId }).expect(201);
      await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/authorize`).send({ mode: "DECLINE" }).expect(201);

      const paymentIntent = await client.post(`/checkout/${checkout.id}/payment-intent`).send({ provider: "DEV_SIMULATED" }).expect(201);
      expect(paymentIntent.body.provider).toBe("DEV_SIMULATED");
      const paid = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      expect(paid.body.paymentStatus).toBe("SUCCEEDED");
      expect(paid.body.orderIds).toHaveLength(1);
    });

    it("never fakes an eligibility check for a provider that doesn't support one", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "DIGI_PAY" }).expect(201);
      const eligibility = await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/eligibility`).send({}).expect(201);
      expect(eligibility.body.status).toBe("ELIGIBLE");
    });

    it("does not confirm an order while a financing authorization is pending, then confirms it once a webhook resolves it", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "DIGI_PAY" }).expect(201);
      const plans = await client.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/plans`).expect(200);
      await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/select-plan`).send({ providerPlanId: plans.body[0].providerPlanId }).expect(201);

      const pending = await client.post(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/authorize`).send({ mode: "PENDING" }).expect(201);
      expect(pending.body.paymentStatus).toBe("PENDING");
      expect(await prisma.order.findMany({ where: { checkoutId: checkout.id } })).toHaveLength(0);

      await request(app.getHttpServer())
        .post("/payments/webhooks/digi_pay")
        .send({ financingIntentId: intentRes.body.id, eventId: `evt_${unique()}`, status: "SUCCEEDED" })
        .expect(201);

      const orders = await pollUntil(
        () => prisma.order.findMany({ where: { checkoutId: checkout.id } }),
        (rows) => rows.length > 0,
      );
      const financingRow = await prisma.financingIntent.findUniqueOrThrow({ where: { id: intentRes.body.id } });
      expect(financingRow.status).toBe(FinancingIntentStatus.APPROVED);
      expect(orders).toHaveLength(1);
    });

    it("refunds a confirmed order in full, updating financial state with a balanced reversing ledger entry", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const orderId = paid.body.orderIds[0];

      const refund = await client.post(`/orders/${orderId}/refunds`).send({ reason: "Changed my mind" }).expect(201);
      expect(refund.body.status).toBe("SUCCEEDED");

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe(OrderStatus.REFUNDED);

      const refundLedgerTx = await prisma.ledgerTransaction.findFirstOrThrow({ where: { referenceType: "REFUND", referenceId: refund.body.id }, include: { entries: true } });
      const debits = refundLedgerTx.entries.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
      const credits = refundLedgerTx.entries.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
      expect(debits).toBe(credits);
      expect(debits).toBe(checkout.totalAmount);
    });

    it("rejects a partial refund amount — only a full refund of the order total is supported this phase", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const orderId = paid.body.orderIds[0];

      const rejected = await client.post(`/orders/${orderId}/refunds`).send({ amount: Math.floor(checkout.totalAmount / 2) }).expect(400);
      expect(rejected.body.error.code).toBe("REFUND_NOT_SUPPORTED");
    });

    it("rejects refunding an order a second time", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const orderId = paid.body.orderIds[0];

      await client.post(`/orders/${orderId}/refunds`).send({}).expect(201);
      const secondAttempt = await client.post(`/orders/${orderId}/refunds`).send({}).expect(400);
      expect(secondAttempt.body.error.code).toBe("REFUND_NOT_SUPPORTED");
    });

    it("reconciliation logs a NONE action and an audit row when local and remote already agree", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "PENDING" }).expect(201);
      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId: checkout.id } });

      const reconcile = await client.post(`/payments/reconcile/${intent.id}`).send({}).expect(201);
      expect(reconcile.body.action).toBe("NONE");
      expect(reconcile.body.localStatus).toBe("PENDING");
      expect(reconcile.body.remoteStatus).toBe("PENDING");
      expect(await prisma.order.findMany({ where: { checkoutId: checkout.id } })).toHaveLength(0);

      const log = await prisma.reconciliationLog.findFirst({ where: { referenceId: intent.id } });
      expect(log).not.toBeNull();
    });

    it("reconciliation logs an explicit UNKNOWN_REMOTE_STATE when there is no provider reference yet", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const intentRes = await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);

      const reconcile = await client.post(`/payments/reconcile/${intentRes.body.id}`).send({}).expect(201);
      expect(reconcile.body.action).toBe("UNKNOWN_REMOTE_STATE");
      expect(reconcile.body.remoteStatus).toBe("UNKNOWN");
    });

    it("resolves a local-pending/provider-resolved disagreement via reconciliation, confirming the order exactly once", async () => {
      const { client, checkout } = await setupCheckoutReady();
      await client.post(`/checkout/${checkout.id}/payment-intent`).send({}).expect(201);
      await client.post(`/checkout/${checkout.id}/pay`).send({ mode: "PENDING" }).expect(201);
      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId: checkout.id } });
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { paymentIntentId: intent.id } });

      // Simulate "the provider actually captured the charge, but its
      // webhook never reached us" by advancing the sandbox gateway's own
      // in-memory remote-state map directly, rather than adding a test-only
      // backdoor API — DevPaymentGateway is a real singleton for the app's
      // lifetime, exactly like a real gateway's own remote state would be.
      const gateway = app.get(DevPaymentGateway);
      (gateway as unknown as { statuses: Map<string, string> }).statuses.set(attempt.providerReference!, "SUCCEEDED");

      const reconcile = await client.post(`/payments/reconcile/${intent.id}`).send({}).expect(201);
      expect(reconcile.body.action).toBe("RESOLVED_SUCCEEDED");
      // As above: resolvePendingIntent's order confirmation happens off an
      // async fire-and-forget domain event, not before this response returns.
      await pollUntil(
        () => prisma.order.findMany({ where: { checkoutId: checkout.id } }),
        (rows) => rows.length > 0,
      );

      const checkoutAfter = await prisma.checkout.findUnique({ where: { id: checkout.id } });
      expect(checkoutAfter?.status).toBe(CheckoutStatus.CONFIRMED);
      const orders = await prisma.order.findMany({ where: { checkoutId: checkout.id } });
      expect(orders).toHaveLength(1);

      // A second reconciliation check against the now-agreeing state must
      // never duplicate the order it already confirmed.
      await client.post(`/payments/reconcile/${intent.id}`).send({}).expect(201);
      expect(await prisma.order.findMany({ where: { checkoutId: checkout.id } })).toHaveLength(1);
    });

    it("keeps every financing amount a plain integer, never a fractional IRR value", async () => {
      const { client, checkout } = await setupCheckoutReady(123_456);
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "SNAPP_PAY" }).expect(201);
      const plans = await client.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}/plans`).expect(200);
      for (const plan of plans.body) {
        expect(Number.isInteger(plan.totalPayableAmount)).toBe(true);
        if (plan.installmentAmount != null) expect(Number.isInteger(plan.installmentAmount)).toBe(true);
        if (plan.feeAmount != null) expect(Number.isInteger(plan.feeAmount)).toBe(true);
      }
    });

    it("denies a user from reading another user's financing intent or ops view (IDOR)", async () => {
      const { client, checkout } = await setupCheckoutReady();
      const stranger = authedRequest(app, await signUp(app, logSpy, `stranger-${unique()}@example.com`));
      const intentRes = await client.post(`/checkout/${checkout.id}/financing-intent`).send({ provider: "SNAPP_PAY" }).expect(201);

      const deniedIntent = await stranger.get(`/checkout/${checkout.id}/financing-intent/${intentRes.body.id}`).expect(404);
      expect(deniedIntent.body.error.code).toBe("CHECKOUT_NOT_FOUND");

      const deniedOps = await stranger.get(`/checkout/${checkout.id}/ops`).expect(404);
      expect(deniedOps.body.error.code).toBe("CHECKOUT_NOT_FOUND");
    });
  });

  describe("Delivery & Logistics Core (Handoff 08)", () => {
    async function setupCheckoutReady(priceAmount = 1_000_000, onHand = 10) {
      const identifier = `logistics-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const product = await prisma.product.create({
        data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
      const seller = await prisma.sellerOrganization.create({
        data: { name: `Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US", city: "Tehran" },
      });
      // Handoff 09: the fulfillment ops actions below are seller-authorized, not
      // buyer-authorized — grant the checkout's own buyer an OWNER membership on
      // this seller so the same `client` can also drive those actions in tests
      // that exercise both roles (a real product would use two separate users).
      const buyerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
      await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: buyerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
      const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount, currency: "IRR" } });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
      const addressRes = await client.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
      return { client, checkoutId: checkout.body.id as string, seller };
    }

    async function payAndGetOrderIds(client: ReturnType<typeof authedRequest>, checkoutId: string): Promise<string[]> {
      await client.post(`/checkout/${checkoutId}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkoutId}/pay`).send({ mode: "SUCCESS" }).expect(201);
      return paid.body.orderIds as string[];
    }

    async function payAndGetOrderId(client: ReturnType<typeof authedRequest>, checkoutId: string): Promise<string> {
      const [orderId] = await payAndGetOrderIds(client, checkoutId);
      return orderId!;
    }

    it("requests shipping quotes from every enabled provider, deterministic price/ETA, standard + express", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const options = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      expect(options.body).toHaveLength(1);

      const quotes = options.body[0].quotes as { provider: string; serviceLevel: string; priceIrr: number; status: string }[];
      expect(new Set(quotes.map((q) => q.provider))).toEqual(new Set(["DEV", "ALOPEYK", "SNAPPBOX"]));

      const devQuotes = quotes.filter((q) => q.provider === "DEV");
      expect(devQuotes.map((q) => q.serviceLevel).sort()).toEqual(["EXPRESS", "STANDARD"]);
      expect(devQuotes.find((q) => q.serviceLevel === "STANDARD")?.priceIrr).toBe(350_000);
      expect(devQuotes.every((q) => q.status === "AVAILABLE")).toBe(true);
    });

    it("keeps every shipping quote price a plain integer, never a fractional IRR value", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const options = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      for (const group of options.body) {
        for (const quote of group.quotes) expect(Number.isInteger(quote.priceIrr)).toBe(true);
      }
    });

    it("selecting a quote recalculates the checkout's deliveryAmount/totalAmount server-side", async () => {
      const { client, checkoutId } = await setupCheckoutReady(1_000_000);
      const before = await client.get(`/checkout/${checkoutId}`).expect(200);
      const options = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      const express = options.body[0].quotes.find((q: { provider: string; serviceLevel: string }) => q.provider === "DEV" && q.serviceLevel === "EXPRESS");

      const selected = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId: express.id }).expect(201);
      expect(selected.body[0].quotes.find((q: { id: string }) => q.id === express.id).status).toBe("SELECTED");

      const after = await client.get(`/checkout/${checkoutId}`).expect(200);
      expect(after.body.deliveryAmount).toBe(express.priceIrr);
      expect(after.body.totalAmount).toBe(before.body.subtotalAmount + express.priceIrr - before.body.discountAmount);
    });

    it("re-selecting the already-selected quote is a safe idempotent no-op", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const options = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      const quoteId = options.body[0].quotes[0].id as string;

      await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId }).expect(201);
      const second = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId }).expect(201);
      expect(second.body[0].quotes.find((q: { id: string }) => q.id === quoteId).status).toBe("SELECTED");

      const selectedCount = (second.body[0].quotes as { status: string }[]).filter((q) => q.status === "SELECTED").length;
      expect(selectedCount).toBe(1);
    });

    it("rejects selecting a shipping quote that belongs to a different checkout", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const { client: otherClient, checkoutId: otherCheckoutId } = await setupCheckoutReady();
      const otherOptions = await otherClient.get(`/checkout/${otherCheckoutId}/shipping-quotes`).expect(200);
      const foreignQuoteId = otherOptions.body[0].quotes[0].id as string;

      const res = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId: foreignQuoteId }).expect(404);
      expect(res.body.error.code).toBe("SHIPPING_QUOTE_NOT_FOUND");
    });

    it("rejects selecting an expired shipping quote", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const options = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      const quoteId = options.body[0].quotes[0].id as string;
      await prisma.shippingQuote.update({ where: { id: quoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId }).expect(410);
      expect(res.body.error.code).toBe("SHIPPING_QUOTE_EXPIRED");
    });

    it("denies a stranger from reading another user's checkout shipping quotes (IDOR)", async () => {
      const { checkoutId } = await setupCheckoutReady();
      const stranger = authedRequest(app, await signUp(app, logSpy, `logistics-stranger-${unique()}@example.com`));
      const denied = await stranger.get(`/checkout/${checkoutId}/shipping-quotes`).expect(404);
      expect(denied.body.error.code).toBe("CHECKOUT_NOT_FOUND");
    });

    it("creates a Fulfillment at AWAITING_SELLER_PREPARATION automatically once payment confirms the Order", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      const fulfillment = await client.get(`/orders/${orderId}/fulfillment`).expect(200);
      expect(fulfillment.body.status).toBe(FulfillmentStatus.AWAITING_SELLER_PREPARATION);
      expect(fulfillment.body.orderId).toBe(orderId);
    });

    it("rejects an invalid Fulfillment transition and protects a terminal state from any further transition", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const transitions = app.get(FulfillmentTransitionService);

      await expect(transitions.transition(fulfillmentRow.id, FulfillmentStatus.DELIVERED)).rejects.toMatchObject({ code: "FULFILLMENT_INVALID_TRANSITION" });

      await transitions.transition(fulfillmentRow.id, FulfillmentStatus.CANCELED);
      await expect(transitions.transition(fulfillmentRow.id, FulfillmentStatus.READY_FOR_PICKUP)).rejects.toMatchObject({ code: "FULFILLMENT_INVALID_TRANSITION" });
    });

    it("walks a Fulfillment/Shipment through the full happy path to DELIVERED via DevShippingAdapter", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);

      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      const requested = await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      expect(requested.body.fulfillment.status).toBe(FulfillmentStatus.PICKUP_REQUESTED);
      expect(requested.body.shipment.status).toBe(ShipmentStatus.REQUESTED);
      expect(requested.body.shipment.trackingCode).toBeTruthy();

      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });
      expect(shipmentRow.provider).toBe(ShippingProvider.DEV);

      const milestones: ShipmentStatus[] = [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED];
      for (const toStatus of milestones) {
        const res = await client.post(`/shipping/dev/simulate/${shipmentRow.providerShipmentId}`).send({ toStatus }).expect(201);
        expect(res.body.processed).toBe(true);
      }

      const tracking = await client.get(`/orders/${orderId}/tracking`).expect(200);
      expect(tracking.body.shipment.status).toBe(ShipmentStatus.DELIVERED);
      expect(tracking.body.fulfillment.status).toBe(FulfillmentStatus.DELIVERED);
      expect(tracking.body.timeline.find((m: { milestone: string }) => m.milestone === ShipmentStatus.DELIVERED).reached).toBe(true);

      const orderDetail = await client.get(`/orders/${orderId}`).expect(200);
      expect(orderDetail.body.fulfillment.status).toBe(FulfillmentStatus.DELIVERED);
    });

    it("acknowledges a duplicate shipment webhook without double-transitioning or duplicating ShipmentEvent rows", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });

      const payload = { providerShipmentId: shipmentRow.providerShipmentId, providerEventId: `evt-${unique()}`, rawStatus: "assigned" };
      const first = await request(app.getHttpServer()).post("/shipping/webhooks/dev").send(payload).expect(201);
      expect(first.body.processed).toBe(true);

      const second = await request(app.getHttpServer()).post("/shipping/webhooks/dev").send(payload).expect(201);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.processed).toBe(false);

      const eventCount = await prisma.shipmentEvent.count({ where: { shipmentId: shipmentRow.id, providerEventId: payload.providerEventId } });
      expect(eventCount).toBe(1);
      const updated = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentRow.id } });
      expect(updated.status).toBe(ShipmentStatus.ASSIGNED);
    });

    it("maps an unrecognized raw provider status to UNKNOWN and never writes it over the local Shipment status", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });

      const payload = { providerShipmentId: shipmentRow.providerShipmentId, providerEventId: `evt-${unique()}`, rawStatus: "totally_unrecognized_status" };
      const res = await request(app.getHttpServer()).post("/shipping/webhooks/dev").send(payload).expect(201);
      expect(res.body.processed).toBe(false);

      const updated = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentRow.id } });
      expect(updated.status).toBe(ShipmentStatus.REQUESTED);
    });

    it("reconciliation logs an explicit UNKNOWN_REMOTE_STATE when a Shipment has no provider reference yet", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      await prisma.shipment.create({
        data: { fulfillmentId: fulfillmentRow.id, sequenceNumber: 1, provider: ShippingProvider.DEV, status: ShipmentStatus.CREATED, pickupAddressSnapshot: {}, deliveryAddressSnapshot: {} },
      });

      const res = await client.post(`/orders/${orderId}/shipment/reconcile`).expect(201);
      expect(res.body.action).toBe("UNKNOWN_REMOTE_STATE");
    });

    it("reconciliation resolves a stale local/provider disagreement but never regresses a Shipment that already reached a terminal state locally", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });

      // The provider's own record (DevShippingAdapter's in-memory state) advances to ASSIGNED via a real webhook...
      await request(app.getHttpServer())
        .post("/shipping/webhooks/dev")
        .send({ providerShipmentId: shipmentRow.providerShipmentId, providerEventId: `evt-${unique()}`, rawStatus: "assigned" })
        .expect(201);

      // ...while local somehow already reached DELIVERED (e.g. an earlier webhook was processed) — the spec's own
      // worked example: "Local: DELIVERED, Provider: IN_TRANSIT → keep DELIVERED, record inconsistency".
      await prisma.shipment.update({ where: { id: shipmentRow.id }, data: { status: ShipmentStatus.DELIVERED, actualDeliveryAt: new Date() } });

      const result = await client.post(`/orders/${orderId}/shipment/reconcile`).expect(201);
      expect(result.body.action).toBe("NONE");
      expect(result.body.localStatus).toBe(ShipmentStatus.DELIVERED);
      expect(result.body.remoteStatus).toBe(ShipmentStatus.ASSIGNED);

      const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentRow.id } });
      expect(after.status).toBe(ShipmentStatus.DELIVERED);
    });

    it("gives a multi-seller checkout independent Fulfillments per seller Order", async () => {
      const identifier = `logistics-multi-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const buyerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });

      async function sellerAndOffer() {
        const product = await prisma.product.create({
          data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
        });
        const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
        const seller = await prisma.sellerOrganization.create({
          data: { name: `Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US" },
        });
        // Handoff 09: grant the buyer OWNER membership on each seller too — see setupCheckoutReady's own comment above.
        await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: buyerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
        const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 1_000_000, currency: "IRR" } });
        await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
        return offer;
      }

      const offerA = await sellerAndOffer();
      const offerB = await sellerAndOffer();
      const addressRes = await client.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      await client.post("/cart/items").send({ offerId: offerA.id, quantity: 1 }).expect(201);
      await client.post("/cart/items").send({ offerId: offerB.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);

      const orderIds = await payAndGetOrderIds(client, checkout.body.id);
      expect(orderIds).toHaveLength(2);

      const fulfillments = await Promise.all(orderIds.map((id) => client.get(`/orders/${id}/fulfillment`).expect(200)));
      expect(fulfillments[0]!.body.id).not.toBe(fulfillments[1]!.body.id);
      expect(fulfillments.every((f) => f.body.status === FulfillmentStatus.AWAITING_SELLER_PREPARATION)).toBe(true);

      await client.post(`/orders/${orderIds[0]}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderIds[0]}/fulfillment/request-courier`).expect(201);

      const first = await client.get(`/orders/${orderIds[0]}/fulfillment`).expect(200);
      const second = await client.get(`/orders/${orderIds[1]}/fulfillment`).expect(200);
      expect(first.body.status).toBe(FulfillmentStatus.PICKUP_REQUESTED);
      expect(second.body.status).toBe(FulfillmentStatus.AWAITING_SELLER_PREPARATION);
    });

    it("denies a stranger from reading or mutating another user's order fulfillment/shipment/tracking (IDOR)", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      const stranger = authedRequest(app, await signUp(app, logSpy, `logistics-stranger2-${unique()}@example.com`));

      expect((await stranger.get(`/orders/${orderId}/fulfillment`).expect(404)).body.error.code).toBe("ORDER_NOT_FOUND");
      expect((await stranger.get(`/orders/${orderId}/tracking`).expect(404)).body.error.code).toBe("ORDER_NOT_FOUND");
      expect((await stranger.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(404)).body.error.code).toBe("ORDER_NOT_FOUND");
    });

    // --- Concurrency (spec section 47) ---------------------------------

    it("Race A: two concurrent requestCourier calls for the same Fulfillment create exactly one Shipment / one external create intent", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);

      const [r1, r2] = await Promise.all([client.post(`/orders/${orderId}/fulfillment/request-courier`), client.post(`/orders/${orderId}/fulfillment/request-courier`)]);
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      // Both requests must resolve to the exact same Shipment row (the id is
      // stable from the instant the row is claimed) — the loser may briefly
      // observe it before the winner's own async provider call has finished
      // populating trackingCode/providerShipmentId, so those two fields are
      // deliberately not compared here (spec's own invariant is "one
      // canonical Shipment, one external create intent", not "identical
      // response bodies").
      expect(r1.body.shipment.id).toBe(r2.body.shipment.id);

      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipments = await prisma.shipment.findMany({ where: { fulfillmentId: fulfillmentRow.id } });
      expect(shipments).toHaveLength(1);
      expect(shipments[0]!.providerShipmentId).toBeTruthy();
      expect(shipments[0]!.status).toBe(ShipmentStatus.REQUESTED);
    });

    it("Race B: two concurrent identical webhook deliveries produce exactly one ShipmentEvent and one applied transition", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });

      const payload = { providerShipmentId: shipmentRow.providerShipmentId, providerEventId: `evt-${unique()}`, rawStatus: "assigned" };
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post("/shipping/webhooks/dev").send(payload),
        request(app.getHttpServer()).post("/shipping/webhooks/dev").send(payload),
      ]);
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect([r1.body.processed, r2.body.processed].filter(Boolean)).toHaveLength(1);

      const eventCount = await prisma.shipmentEvent.count({ where: { shipmentId: shipmentRow.id, providerEventId: payload.providerEventId } });
      expect(eventCount).toBe(1);
      const updated = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentRow.id } });
      expect(updated.status).toBe(ShipmentStatus.ASSIGNED);
    });

    // --- Required flows (spec sections 51-52) ---------------------------

    it("Failure flow: a Shipment that fails after pickup leaves Fulfillment/Order/Payment in a coherent, recoverable state", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const orderId = await payAndGetOrderId(client, checkoutId);
      await client.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(201);
      await client.post(`/orders/${orderId}/fulfillment/request-courier`).expect(201);
      const fulfillmentRow = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const shipmentRow = await prisma.shipment.findFirstOrThrow({ where: { fulfillmentId: fulfillmentRow.id } });

      for (const toStatus of [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP]) {
        await client.post(`/shipping/dev/simulate/${shipmentRow.providerShipmentId}`).send({ toStatus }).expect(201);
      }
      const failed = await client.post(`/shipping/dev/simulate/${shipmentRow.providerShipmentId}`).send({ toStatus: ShipmentStatus.FAILED }).expect(201);
      expect(failed.body.processed).toBe(true);

      const trackingAfterFailure = await client.get(`/orders/${orderId}/tracking`).expect(200);
      expect(trackingAfterFailure.body.shipment.status).toBe(ShipmentStatus.FAILED);
      expect(trackingAfterFailure.body.fulfillment.status).toBe(FulfillmentStatus.FAILED);

      const fulfillmentAfter = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentRow.id } });
      expect(fulfillmentAfter.failureCode).toBeTruthy();
      expect(fulfillmentAfter.failureReason).toBeTruthy();
      const failureEvent = await prisma.shipmentEvent.findFirst({ where: { shipmentId: shipmentRow.id, canonicalStatus: ShipmentStatus.FAILED } });
      expect(failureEvent).toBeTruthy();

      // Order/Payment truth is independent of the shipment's own failure — money already moved and the commercial
      // record stays coherent; only the physical-fulfillment side reflects the problem (spec section 20).
      const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(orderRow.status).toBe(OrderStatus.CONFIRMED);
      const paymentIntent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId } });
      expect(paymentIntent.status).toBe("CAPTURED");

      // Recovery/support path remains reachable — reconciliation and tracking both still function on a failed shipment.
      const reconciled = await client.post(`/orders/${orderId}/shipment/reconcile`).expect(201);
      expect(reconciled.body.localStatus).toBe(ShipmentStatus.FAILED);
    });

    it("Quote expiration flow: an expired quote is rejected, then refreshing produces a new quote that can be selected", async () => {
      const { client, checkoutId } = await setupCheckoutReady();
      const firstOptions = await client.get(`/checkout/${checkoutId}/shipping-quotes`).expect(200);
      const staleQuoteId = firstOptions.body[0].quotes.find((q: { provider: string }) => q.provider === "DEV").id as string;
      await prisma.shippingQuote.update({ where: { id: staleQuoteId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const rejected = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId: staleQuoteId }).expect(410);
      expect(rejected.body.error.code).toBe("SHIPPING_QUOTE_EXPIRED");

      const refreshed = await client.post(`/checkout/${checkoutId}/shipping-quotes/refresh`).expect(201);
      const freshQuote = refreshed.body[0].quotes.find((q: { provider: string; status: string }) => q.provider === "DEV" && q.status === "AVAILABLE");
      expect(freshQuote).toBeTruthy();
      expect(freshQuote.id).not.toBe(staleQuoteId);

      const selected = await client.post(`/checkout/${checkoutId}/shipping-quotes/select`).send({ quoteId: freshQuote.id }).expect(201);
      expect(selected.body[0].quotes.find((q: { id: string }) => q.id === freshQuote.id).status).toBe("SELECTED");
    });
  });

  describe("Seller OS + Marketplace Channel Integrations (Handoff 09)", () => {
    async function setupSeller() {
      const identifier = `seller-owner-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
      const seller = await prisma.sellerOrganization.create({
        data: { name: `Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US" },
      });
      await prisma.sellerMembership.create({
        data: { sellerOrganizationId: seller.id, userId: ownerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() },
      });
      return { client, sellerId: seller.id, ownerUserId: ownerUser.id };
    }

    async function addMember(sellerId: string, role: SellerMembershipRole) {
      const identifier = `seller-member-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
      await prisma.sellerMembership.create({ data: { sellerOrganizationId: sellerId, userId: user.id, role, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
      return { client, userId: user.id };
    }

    async function createOfferWithInventory(sellerId: string, onHand = 10) {
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const product = await prisma.product.create({
        data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
      const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variant.id, priceAmount: 500_000, currency: "IRR", sellerSku: `SSKU-${unique()}` } });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
      return offer;
    }

    async function connectDevChannel(client: ReturnType<typeof authedRequest>, sellerId: string): Promise<string> {
      const res = await client.post(`/seller-organizations/${sellerId}/channels`).send({ provider: MarketplaceProvider.DEV }).expect(201);
      return res.body.id as string;
    }

    async function createAndPublishListing(client: ReturnType<typeof authedRequest>, sellerId: string, channelAccountId: string, sellerOfferId: string) {
      const created = await client.post(`/seller-organizations/${sellerId}/marketplace-listings`).send({ marketplaceChannelAccountId: channelAccountId, sellerOfferId }).expect(201);
      const published = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${created.body.id}/publish`).expect(201);
      return published.body as { id: string; externalListingId: string; status: string; syncStatus: string; publishedInventory: number; publishedPriceIrr: number };
    }

    // --- Access control (spec section 50) ------------------------------

    it("a seller member can access their own seller organization", async () => {
      const { client, sellerId } = await setupSeller();
      const res = await client.get(`/seller-organizations/${sellerId}`).expect(200);
      expect(res.body.id).toBe(sellerId);
    });

    it("denies cross-seller access — a member of Seller A cannot reach Seller B's organization/offers", async () => {
      const { client: clientA } = await setupSeller();
      const { sellerId: sellerBId } = await setupSeller();

      await clientA.get(`/seller-organizations/${sellerBId}`).expect(403);
      await clientA.get(`/seller-organizations/${sellerBId}/offers`).expect(403);
    });

    it("VIEWER cannot mutate an offer, but CATALOG_MANAGER can", async () => {
      const { sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const viewer = await addMember(sellerId, SellerMembershipRole.VIEWER);
      const catalogManager = await addMember(sellerId, SellerMembershipRole.CATALOG_MANAGER);

      await viewer.client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 600_000 }).expect(403);
      const updated = await catalogManager.client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 600_000 }).expect(200);
      expect(updated.body.priceAmount).toBe(600_000);
    });

    it("suspended seller rejected from operational changes but reads still work", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      await prisma.sellerOrganization.update({ where: { id: sellerId }, data: { status: SellerStatus.SUSPENDED } });

      await client.get(`/seller-organizations/${sellerId}/offers`).expect(200);
      await client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 700_000 }).expect(403);
    });

    // --- Offer / Inventory management (spec section 6-8) ---------------

    it("creates and updates a seller offer", async () => {
      const { client, sellerId } = await setupSeller();
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const product = await prisma.product.create({
        data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });

      const created = await client
        .post(`/seller-organizations/${sellerId}/offers`)
        .send({ productVariantId: variant.id, priceAmount: 250_000, initialOnHand: 5 })
        .expect(201);
      expect(created.body.priceAmount).toBe(250_000);
      expect(created.body.inventory.onHand).toBe(5);

      const updated = await client.patch(`/seller-organizations/${sellerId}/offers/${created.body.id}`).send({ priceAmount: 275_000 }).expect(200);
      expect(updated.body.priceAmount).toBe(275_000);
    });

    it("adjusts inventory absolutely and by delta, returning the recomputed available quantity", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });

      const abs = await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "ABSOLUTE", quantity: 20 }).expect(200);
      expect(abs.body.inventory.onHand).toBe(20);
      expect(abs.body.inventory.available).toBe(20);

      const delta = await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "DELTA", quantity: -5 }).expect(200);
      expect(delta.body.inventory.onHand).toBe(15);
    });

    it("records an InventoryMovement row for every inventory adjustment (audit trail)", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });

      await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "DELTA", quantity: 5, reason: "Restock" }).expect(200);

      const history = await client.get(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}/history`).expect(200);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0].type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(history.body.items[0].quantityBefore).toBe(10);
      expect(history.body.items[0].quantityAfter).toBe(15);
      expect(history.body.items[0].reason).toBe("Restock");
    });

    it("rejects an inventory adjustment that would make available stock negative", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 3);
      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });

      const res = await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "DELTA", quantity: -10 }).expect(409);
      expect(res.body.error.code).toBe("INVENTORY_MOVEMENT_INVALID");

      const unchanged = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItem.id } });
      expect(unchanged.onHand).toBe(3);
    });

    it("Flow A — Seller operations: dashboard reflects an inventory update and an offer price change", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });

      const before = await client.get(`/seller-organizations/${sellerId}/dashboard`).expect(200);
      expect(before.body.lowStockOfferCount).toBe(0);
      expect(before.body.activeOfferCount).toBe(1);

      await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "ABSOLUTE", quantity: 2 }).expect(200);
      await client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 800_000 }).expect(200);

      const after = await client.get(`/seller-organizations/${sellerId}/dashboard`).expect(200);
      expect(after.body.lowStockOfferCount).toBe(1); // now below the low-stock threshold

      const updatedOffer = await client.get(`/seller-organizations/${sellerId}/offers/${offer.id}`).expect(200);
      expect(updatedOffer.body.priceAmount).toBe(800_000);
      expect(updatedOffer.body.inventory.onHand).toBe(2);
    });

    // --- Marketplace channel / listing lifecycle (spec section 11-18) --

    it("Flow B — DEV marketplace: offer -> listing -> publish -> sync inventory -> sync price -> success state visible", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);

      const created = await client.post(`/seller-organizations/${sellerId}/marketplace-listings`).send({ marketplaceChannelAccountId: channelAccountId, sellerOfferId: offer.id }).expect(201);
      expect(created.body.status).toBe("DRAFT");

      const published = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${created.body.id}/publish`).expect(201);
      expect(published.body.status).toBe("ACTIVE");
      expect(published.body.syncStatus).toBe("SYNCED");

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "ABSOLUTE", quantity: 3 }).expect(200);
      const inventorySynced = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${created.body.id}/sync`).expect(201);
      expect(inventorySynced.body.publishedInventory).toBe(3);

      await client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 720_000 }).expect(200);
      const priceSynced = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${created.body.id}/sync`).expect(201);
      expect(priceSynced.body.publishedPriceIrr).toBe(720_000);
      expect(priceSynced.body.syncStatus).toBe("SYNCED"); // success state visible to the seller, never silent
    });

    it("creates a marketplace listing mapping", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const channelAccountId = await connectDevChannel(client, sellerId);

      const listing = await client.post(`/seller-organizations/${sellerId}/marketplace-listings`).send({ marketplaceChannelAccountId: channelAccountId, sellerOfferId: offer.id }).expect(201);
      expect(listing.body.status).toBe("DRAFT");
      expect(listing.body.syncStatus).toBe("NEVER_SYNCED");
    });

    it("publishes a listing through the DEV adapter", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const channelAccountId = await connectDevChannel(client, sellerId);

      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      expect(listing.status).toBe("ACTIVE");
      expect(listing.syncStatus).toBe("SYNCED");
      expect(listing.externalListingId).toBeTruthy();
    });

    it("syncs inventory for a published listing after a stock change", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      expect(listing.publishedInventory).toBe(10);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      await client.patch(`/seller-organizations/${sellerId}/inventory/${inventoryItem.id}`).send({ mode: "ABSOLUTE", quantity: 4 }).expect(200);

      const synced = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${listing.id}/sync`).expect(201);
      expect(synced.body.publishedInventory).toBe(4);
      expect(synced.body.syncStatus).toBe("SYNCED");
    });

    it("syncs price for a published listing after a price change", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);

      await client.patch(`/seller-organizations/${sellerId}/offers/${offer.id}`).send({ priceAmount: 999_000 }).expect(200);
      const synced = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${listing.id}/sync`).expect(201);
      expect(synced.body.publishedPriceIrr).toBe(999_000);
    });

    it("records a failed MarketplaceSyncAttempt when the DEV adapter simulates a publish rejection", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const created = await client.post(`/seller-organizations/${sellerId}/marketplace-listings`).send({ marketplaceChannelAccountId: channelAccountId, sellerOfferId: offer.id }).expect(201);

      const rejected = await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/publish-rejection`)
        .send({ listingId: created.body.id })
        .expect(201);
      expect(rejected.body.status).toBe("REJECTED");
      expect(rejected.body.syncStatus).toBe("FAILED");

      const attempts = await prisma.marketplaceSyncAttempt.findMany({ where: { marketplaceListingId: created.body.id } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.status).toBe("FAILED");
    });

    it("Flow F — Reconciliation mismatch: PET LIFE OS detects the mismatch, canonical inventory unchanged, listing shows degraded state", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);

      await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/mismatch`).send({ externalListingId: listing.externalListingId, availableQuantity: 2 }).expect(201);

      const reconciled = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${listing.id}/reconcile`).expect(201);
      expect(reconciled.body.discrepancyType).toBe("INVENTORY_MISMATCH");
      expect(reconciled.body.canonicalValue).toBe(10);
      expect(reconciled.body.providerObservedValue).toBe(2);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(10); // never overwritten by the provider's observed value

      const listingAfter = await client.get(`/seller-organizations/${sellerId}/marketplace-listings/${listing.id}`).expect(200);
      expect(listingAfter.body.syncStatus).toBe("DEGRADED"); // the seller sees a degraded/reconciliation state, not silence
    });

    // --- Marketplace order ingestion (spec section 24-31) ---------------

    it("Flow C — External marketplace order: MarketplaceOrder created once, internal Order visible to the seller, canonical inventory decreases", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      const externalOrderId = `flow-c-${unique()}`;

      const ingested = await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
        .send({ externalOrderId, items: [{ externalListingId: listing.externalListingId, quantity: 1, unitPriceAmount: 500_000 }] })
        .expect(201);

      const marketplaceOrders = await prisma.marketplaceOrder.findMany({ where: { provider: MarketplaceProvider.DEV, marketplaceChannelAccountId: channelAccountId, externalOrderId } });
      expect(marketplaceOrders).toHaveLength(1); // created once

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(9); // canonical inventory decreases

      // The seller sees the order through the same unified Orders view real checkout Orders use.
      const sellerOrders = await client.get(`/seller-organizations/${sellerId}/orders`).expect(200);
      const visible = sellerOrders.body.items.find((o: { orderId: string }) => o.orderId === ingested.body.mappedOrderId);
      expect(visible).toBeTruthy();
      expect(visible.source).toBe("DEV");
    });

    it("ingests a marketplace order: decrements inventory exactly once and maps to an internal Order", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      const externalOrderId = `ext-order-${unique()}`;

      const ingested = await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
        .send({ externalOrderId, items: [{ externalListingId: listing.externalListingId, quantity: 2, unitPriceAmount: 500_000 }] })
        .expect(201);
      expect(ingested.body.externalOrderId).toBe(externalOrderId);
      expect(ingested.body.mappedOrderId).toBeTruthy();
      expect(ingested.body.deliveryResponsibility).toBe("MARKETPLACE");
      expect(ingested.body.paymentSource).toBe("MARKETPLACE_COLLECTED");

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(8);

      const mappedOrder = await prisma.order.findUniqueOrThrow({ where: { id: ingested.body.mappedOrderId } });
      expect(mappedOrder.sellerOrganizationId).toBe(sellerId);
      expect(mappedOrder.userId).toBeNull();
      expect(mappedOrder.checkoutId).toBeNull();
      expect(mappedOrder.totalAmount).toBe(1_000_000);
    });

    it("Flow D — Duplicate marketplace event: one MarketplaceOrder, one internal Order, one inventory decrement", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      const externalOrderId = `ext-order-${unique()}`;
      const payload = { externalOrderId, items: [{ externalListingId: listing.externalListingId, quantity: 1, unitPriceAmount: 500_000 }] };

      const first = await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`).send(payload).expect(201);
      const second = await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`).send(payload).expect(201);
      expect(second.body.id).toBe(first.body.id);

      const marketplaceOrders = await prisma.marketplaceOrder.findMany({ where: { provider: MarketplaceProvider.DEV, marketplaceChannelAccountId: channelAccountId, externalOrderId } });
      expect(marketplaceOrders).toHaveLength(1);

      const internalOrders = await prisma.order.findMany({ where: { sellerOrganizationId: sellerId } });
      expect(internalOrders).toHaveLength(1);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(9); // decremented exactly once, not twice
    });

    it("marketplace cancellation restores inventory exactly once", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      const externalOrderId = `ext-order-${unique()}`;
      await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
        .send({ externalOrderId, items: [{ externalListingId: listing.externalListingId, quantity: 3, unitPriceAmount: 500_000 }] })
        .expect(201);

      let inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(7);

      const cancelled = await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/cancellation`).send({ externalOrderId }).expect(201);
      expect(cancelled.body.status).toBe("CANCELLED");

      inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(10);
    });

    it("a duplicate marketplace cancellation is a safe no-op", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 10);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      const externalOrderId = `ext-order-${unique()}`;
      await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
        .send({ externalOrderId, items: [{ externalListingId: listing.externalListingId, quantity: 2, unitPriceAmount: 500_000 }] })
        .expect(201);

      await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/cancellation`).send({ externalOrderId }).expect(201);
      await client.post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/cancellation`).send({ externalOrderId }).expect(201);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(10); // restored exactly once, not twice
    });

    // --- Concurrency (spec section 10, 21, 66-21) -----------------------

    it("Race: two concurrent marketplace orders for the last unit of stock — exactly one succeeds, no oversell", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 1);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);

      const [r1, r2] = await Promise.all([
        client
          .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
          .send({ externalOrderId: `race-a-${unique()}`, items: [{ externalListingId: listing.externalListingId, quantity: 1, unitPriceAmount: 500_000 }] }),
        client
          .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
          .send({ externalOrderId: `race-b-${unique()}`, items: [{ externalListingId: listing.externalListingId, quantity: 1, unitPriceAmount: 500_000 }] }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(0); // never negative

      // Both externalOrderIds are distinct real deliveries, so both are recorded — the loser is never
      // silently discarded, it is a traceable FAILED row with no mappedOrderId (spec: never fake success).
      const marketplaceOrders = await prisma.marketplaceOrder.findMany({ where: { sellerOrganizationId: sellerId } });
      expect(marketplaceOrders).toHaveLength(2);
      const succeeded = marketplaceOrders.filter((o) => o.mappedOrderId);
      const failed = marketplaceOrders.filter((o) => !o.mappedOrderId);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.status).toBe("FAILED");

      const internalOrders = await prisma.order.findMany({ where: { sellerOrganizationId: sellerId } });
      expect(internalOrders).toHaveLength(1); // only the winner ever gets an internal Order
    });

    it("a marketplace order cannot oversell stock a concurrent PET LIFE OS checkout already reserved", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId, 1);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);

      // A PET LIFE OS checkout reserves the last unit first (a real InventoryReservation, not just onHand).
      const buyerIdentifier = `checkout-buyer-${unique()}@example.com`;
      const buyer = authedRequest(app, await signUp(app, logSpy, buyerIdentifier));
      await buyer.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const household = await buyer.post("/households").send({}).expect(201);
      const addressRes = await buyer.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      await buyer.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);

      // A marketplace order for the same (now-reserved) unit must not succeed in decrementing onHand below reserved.
      const marketplaceResult = await client
        .post(`/seller-organizations/${sellerId}/channels/${channelAccountId}/dev/simulate/order`)
        .send({ externalOrderId: `checkout-race-${unique()}`, items: [{ externalListingId: listing.externalListingId, quantity: 1, unitPriceAmount: 500_000 }] });
      expect(marketplaceResult.status).toBe(409);

      const inventoryItem = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
      expect(inventoryItem.onHand).toBe(1);
      expect(inventoryItem.reserved).toBe(1);
    });

    // --- Multi-seller isolation (spec section 22, 51) --------------------

    it("Flow E — Cross-seller isolation: Seller A cannot reach Seller B's inventory, orders, listings, team, or channels", async () => {
      const { client: clientA, sellerId: sellerAId } = await setupSeller();
      const { sellerId: sellerBId } = await setupSeller();
      const offerB = await createOfferWithInventory(sellerBId);

      await clientA.get(`/seller-organizations/${sellerBId}/offers/${offerB.id}`).expect(403);
      await clientA.get(`/seller-organizations/${sellerBId}/inventory`).expect(403);
      await clientA.get(`/seller-organizations/${sellerBId}/members`).expect(403);
      await clientA.get(`/seller-organizations/${sellerBId}/channels`).expect(403);
      await clientA.get(`/seller-organizations/${sellerAId}/offers`).expect(200); // sanity: A's own access still works
    });

    // --- Seller fulfillment action authorization (spec section 39) ------

    it("seller fulfillment actions require membership in the order's own seller organization", async () => {
      const { sellerId: unrelatedSellerId } = await setupSeller();
      const { client: strangerMember } = await addMember(unrelatedSellerId, SellerMembershipRole.OWNER);

      const { client, checkoutId } = await setupCheckoutReadyForMarketplaceTests();
      await client.post(`/checkout/${checkoutId}/payment-intent`).send({}).expect(201);
      const paid = await client.post(`/checkout/${checkoutId}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const [orderId] = paid.body.orderIds as string[];

      // A user who is a real, active seller member — just of a different seller — is still denied.
      await strangerMember.post(`/orders/${orderId}/fulfillment/ready-for-pickup`).expect(404);
    });

    async function setupCheckoutReadyForMarketplaceTests() {
      const identifier = `marketplace-fulfillment-${unique()}@example.com`;
      const client = authedRequest(app, await signUp(app, logSpy, identifier));
      const household = await client.post("/households").send({}).expect(201);
      const category = await prisma.productCategory.create({ data: { name: `Category ${unique()}`, slug: `category-${unique()}` } });
      const product = await prisma.product.create({
        data: { categoryId: category.id, title: `Product ${unique()}`, slug: `product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] },
      });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${unique()}` } });
      const seller = await prisma.sellerOrganization.create({
        data: { name: `Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US" },
      });
      const buyerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
      await prisma.sellerMembership.create({
        data: { sellerOrganizationId: seller.id, userId: buyerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() },
      });
      const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 1_000_000, currency: "IRR" } });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
      const addressRes = await client.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
      await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
      const checkout = await client.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
      return { client, checkoutId: checkout.body.id as string };
    }

    // --- Provider secret exposure (spec section 14, 25) ------------------

    it("never exposes a provider secret/credential field in a marketplace channel account API response", async () => {
      const { client, sellerId } = await setupSeller();
      const channelAccountId = await connectDevChannel(client, sellerId);
      const res = await client.get(`/seller-organizations/${sellerId}/channels/${channelAccountId}`).expect(200);
      const serialized = JSON.stringify(res.body).toLowerCase();
      expect(serialized).not.toContain("apikey");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("password");
      expect(res.body.metadata).toBeUndefined();
    });

    // --- Listing sync status distinct from business status (spec 16) ----

    it("keeps listing business status and sync status as separate axes", async () => {
      const { client, sellerId } = await setupSeller();
      const offer = await createOfferWithInventory(sellerId);
      const channelAccountId = await connectDevChannel(client, sellerId);
      const listing = await createAndPublishListing(client, sellerId, channelAccountId, offer.id);
      expect(listing.status).toBe("ACTIVE");
      expect(listing.syncStatus).toBe(MarketplaceListingSyncStatus.SYNCED);

      const deactivated = await client.post(`/seller-organizations/${sellerId}/marketplace-listings/${listing.id}/deactivate`).expect(201);
      expect(deactivated.body.status).toBe("PAUSED");
      // Deactivating is a business-status change; the last real sync result is untouched.
      expect(deactivated.body.syncStatus).toBe(MarketplaceListingSyncStatus.SYNCED);
    });
  });
});
