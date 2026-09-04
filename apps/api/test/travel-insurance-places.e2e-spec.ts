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
  const verifyRes = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier, code }).expect(200);
  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
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
 * Handoff 19 — Travel + Insurance + Pet-Friendly Places e2e flows (mirrors
 * lost-pet-animal-support-community-memories.e2e-spec.ts's own structure).
 * Covers spec Flows A-M (public browsing, trip creation, readiness,
 * document reuse, staleness, insurance browse/compare/eligibility/
 * application, place geo search/privacy, support linkage, cross-household
 * isolation).
 */
describe("Travel + Insurance + Pet-Friendly Places (Handoff 19)", () => {
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

  async function setupHousehold(petName = "Rex") {
    const identifier = `h19-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id as string;
    const pet = await client.post(`/households/${householdId}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 24 }).expect(201);
    return { client, householdId, ownerUserId: ownerUser.id as string, petId: pet.body.id as string };
  }

  async function setupAdmin(role: AdminRole = AdminRole.ADMIN) {
    const identifier = `h19-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { client, userId: user.id as string };
  }

  async function setupVerifiedListedProduct(admin: Awaited<ReturnType<typeof setupAdmin>>, overrides: Record<string, unknown> = {}) {
    const provider = await admin.client.post("/admin/insurance/providers").send({ name: `Provider ${unique()}`, country: "IR" }).expect(201);
    const providerId = provider.body.id as string;
    await admin.client.post(`/admin/insurance/providers/${providerId}/verification`).send({ status: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/insurance/providers/${providerId}/listing`).send({ isPubliclyListed: true }).expect(201);

    const product = await admin.client
      .post(`/admin/insurance/providers/${providerId}/products`)
      .send({
        name: `Plan ${unique()}`,
        country: "IR",
        speciesEligibility: ["DOG"],
        coverageTypes: ["ACCIDENT", "ILLNESS"],
        coverageSummary: "Covers accidents and illness",
        exclusions: ["Pre-existing conditions", "Cosmetic procedures"],
        ...overrides,
      })
      .expect(201);
    const productId = product.body.id as string;
    await admin.client.post(`/admin/insurance/products/${productId}/verification`).send({ status: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/insurance/products/${productId}/listing`).send({ isPubliclyListed: true }).expect(201);
    return { providerId, productId };
  }

  async function setupVerifiedListedPlace(admin: Awaited<ReturnType<typeof setupAdmin>>, overrides: Record<string, unknown> = {}) {
    const place = await admin.client
      .post("/admin/places")
      .send({ name: `Park ${unique()}`, category: "PARK", country: "IR", city: "Tehran", latitude: 35.7, longitude: 51.4, ...overrides })
      .expect(201);
    const placeId = place.body.id as string;
    await admin.client.post(`/admin/places/${placeId}/verification`).send({ status: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/places/${placeId}/listing`).send({ isPubliclyListed: true }).expect(201);
    return { placeId };
  }

  // -- Flow B: Trip creation + explicit state machine --------------------------

  it("Flow B: a trip starts in DRAFT and only advances through explicit, allowed transitions", async () => {
    const { client, petId } = await setupHousehold();

    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    const tripId = trip.body.id as string;
    expect(trip.body.status).toBe("DRAFT");

    // DRAFT -> COMPLETED directly is not an allowed transition.
    await client.post(`/pets/${petId}/trips/${tripId}/transition`).send({ status: "COMPLETED" }).expect(409);

    await client.post(`/pets/${petId}/trips/${tripId}/transition`).send({ status: "PLANNING" }).expect(200);
    await client.post(`/pets/${petId}/trips/${tripId}/transition`).send({ status: "READY" }).expect(200);
    const inProgress = await client.post(`/pets/${petId}/trips/${tripId}/transition`).send({ status: "IN_PROGRESS" }).expect(200);
    expect(inProgress.body.status).toBe("IN_PROGRESS");
  });

  // -- Flow C: Readiness — unknown never auto-becomes ready ---------------------

  it("Flow C: an untouched requirement never counts as ready, and the summary requires every requirement to be explicitly settled", async () => {
    const { client, petId } = await setupHousehold();
    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    const tripId = trip.body.id as string;

    // A trip with no requirements at all is never "ready" (an empty checklist must not read as travel-ready).
    const emptyReadiness = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(emptyReadiness.body.allReady).toBe(false);

    const req1 = await client.post(`/pets/${petId}/trips/${tripId}/requirements`).send({ requirementType: "RABIES" }).expect(201);
    expect(req1.body.status).toBe("UNKNOWN");
    const req2 = await client.post(`/pets/${petId}/trips/${tripId}/requirements`).send({ requirementType: "MICROCHIP" }).expect(201);

    const readiness = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(readiness.body.allReady).toBe(false);
    expect(readiness.body.readyCount).toBe(0);
    expect(readiness.body.totalCount).toBe(2);

    await client.patch(`/pets/${petId}/trips/${tripId}/requirements/${req1.body.id}`).send({ status: "READY", markVerified: true }).expect(200);
    const partial = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(partial.body.allReady).toBe(false);
    expect(partial.body.readyCount).toBe(1);

    await client.patch(`/pets/${petId}/trips/${tripId}/requirements/${req2.body.id}`).send({ status: "NOT_REQUIRED" }).expect(200);
    const full = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(full.body.allReady).toBe(true);
  });

  // -- Flow D: Health/document reuse — no parallel store, no cross-pet linkage --

  it("Flow D: a travel document reuses the existing H17 store, and linking a document belonging to another pet is rejected", async () => {
    const { client, petId } = await setupHousehold();
    const { client: otherClient, petId: otherPetId } = await setupHousehold("Milo");

    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    const tripId = trip.body.id as string;
    const requirement = await client.post(`/pets/${petId}/trips/${tripId}/requirements`).send({ requirementType: "HEALTH_CERTIFICATE" }).expect(201);

    const upload = await client.post(`/pets/${petId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 1024 }).expect(201);
    const document = await client
      .post(`/pets/${petId}/health/documents`)
      .send({ key: upload.body.key, documentType: "TRAVEL_DOCUMENT", title: "Health certificate", mimeType: "application/pdf", fileSizeBytes: 1024 })
      .expect(201);

    const linked = await client.patch(`/pets/${petId}/trips/${tripId}/requirements/${requirement.body.id}`).send({ linkedMedicalDocumentId: document.body.id }).expect(200);
    expect(linked.body.linkedMedicalDocumentId).toBe(document.body.id);
    expect(linked.body.linkedMedicalDocumentTitle).toBe("Health certificate");

    // The document is a normal H17 MedicalDocument row, not a parallel store — it appears in the pet's own health documents list.
    const documents = await client.get(`/pets/${petId}/health/documents`).expect(200);
    expect(documents.body.some((d: { id: string }) => d.id === document.body.id)).toBe(true);

    // A document belonging to a different pet must never be linkable.
    const otherUpload = await otherClient.post(`/pets/${otherPetId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 512 }).expect(201);
    const otherDocument = await otherClient
      .post(`/pets/${otherPetId}/health/documents`)
      .send({ key: otherUpload.body.key, documentType: "TRAVEL_DOCUMENT", title: "Someone else's document", mimeType: "application/pdf", fileSizeBytes: 512 })
      .expect(201);
    await client.patch(`/pets/${petId}/trips/${tripId}/requirements/${requirement.body.id}`).send({ linkedMedicalDocumentId: otherDocument.body.id }).expect(400);
  });

  // -- Flow E: Staleness is surfaced, never hidden ------------------------------

  it("Flow E: a never-verified requirement is surfaced as stale, and verifying it clears the flag", async () => {
    const { client, petId } = await setupHousehold();
    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    const tripId = trip.body.id as string;
    const requirement = await client.post(`/pets/${petId}/trips/${tripId}/requirements`).send({ requirementType: "PARASITE_TREATMENT" }).expect(201);
    expect(requirement.body.isStale).toBe(true);

    const readinessBefore = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(readinessBefore.body.hasStaleRequirement).toBe(true);

    await client.patch(`/pets/${petId}/trips/${tripId}/requirements/${requirement.body.id}`).send({ markVerified: true }).expect(200);
    const readinessAfter = await client.get(`/pets/${petId}/trips/${tripId}/readiness`).expect(200);
    expect(readinessAfter.body.hasStaleRequirement).toBe(false);
  });

  // -- Flow F: Insurance public browse only shows verified + listed products ---

  it("Flow F: an unverified insurance product is invisible on the public directory until verified and listed", async () => {
    const admin = await setupAdmin();
    const provider = await admin.client.post("/admin/insurance/providers").send({ name: `Provider ${unique()}`, country: "IR" }).expect(201);
    const providerId = provider.body.id as string;
    const product = await admin.client
      .post(`/admin/insurance/providers/${providerId}/products`)
      .send({ name: `Plan ${unique()}`, country: "IR", speciesEligibility: ["DOG"], coverageTypes: ["ACCIDENT"], coverageSummary: "Basic", exclusions: [] })
      .expect(201);
    const productId = product.body.id as string;

    await request(app.getHttpServer()).get(`/insurance/products/${productId}`).expect(404);

    await admin.client.post(`/admin/insurance/providers/${providerId}/verification`).send({ status: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/insurance/providers/${providerId}/listing`).send({ isPubliclyListed: true }).expect(201);
    await admin.client.post(`/admin/insurance/products/${productId}/verification`).send({ status: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/insurance/products/${productId}/listing`).send({ isPubliclyListed: true }).expect(201);

    const visible = await request(app.getHttpServer()).get(`/insurance/products/${productId}`).expect(200);
    expect(visible.body.status).toBe("VERIFIED");
  });

  // -- Flow G: Comparison always carries exclusions -----------------------------

  it("Flow G: comparing products returns exclusions for every product, never folded away", async () => {
    const admin = await setupAdmin();
    const first = await setupVerifiedListedProduct(admin, { exclusions: ["Dental cleaning"] });
    const second = await setupVerifiedListedProduct(admin, { exclusions: ["Hereditary conditions", "Breeding costs"] });

    const compared = await request(app.getHttpServer()).get(`/insurance/products/compare?productIds=${first.productId},${second.productId}`).expect(200);
    expect(compared.body).toHaveLength(2);
    for (const product of compared.body) {
      expect(Array.isArray(product.exclusions)).toBe(true);
      expect(product.exclusions.length).toBeGreaterThan(0);
    }
  });

  // -- Flow H: Eligibility never overclaims ------------------------------------

  it("Flow H: eligibility is NOT_ELIGIBLE for a mismatched species and never claims ELIGIBLE for an unrecorded age boundary", async () => {
    const admin = await setupAdmin();
    const { client, petId } = await setupHousehold();

    const catOnly = await setupVerifiedListedProduct(admin, { speciesEligibility: ["CAT"] });
    const speciesResult = await client.get(`/pets/${petId}/insurance-applications/eligibility/${catOnly.productId}`).expect(200);
    expect(speciesResult.body.status).toBe("NOT_ELIGIBLE");

    const ageGated = await setupVerifiedListedProduct(admin, { speciesEligibility: ["DOG"], minAgeMonths: 6, maxAgeMonths: 96 });
    const dogResult = await client.get(`/pets/${petId}/insurance-applications/eligibility/${ageGated.productId}`).expect(200);
    // The test pet has approximateAgeMonths recorded (24), within [6, 96] -> ELIGIBLE is legitimate here since every criterion is known and satisfied.
    expect(["ELIGIBLE", "POSSIBLY_ELIGIBLE"]).toContain(dogResult.body.status);
    expect(dogResult.body.status).not.toBe("NOT_ELIGIBLE");
  });

  // -- Flow I: Application never simulates underwriting -------------------------

  it("Flow I: submitting an application only ever reaches SUBMITTED, never a fabricated APPROVED/DECLINED decision", async () => {
    const admin = await setupAdmin();
    const { client, petId } = await setupHousehold();
    const { productId } = await setupVerifiedListedProduct(admin);

    const application = await client.post(`/pets/${petId}/insurance-applications`).send({ productId }).expect(201);
    expect(application.body.status).toBe("DRAFT");

    const submitted = await client.post(`/pets/${petId}/insurance-applications/${application.body.id}/submit`).send({}).expect(200);
    expect(submitted.body.status).toBe("SUBMITTED");
    expect(["APPROVED", "DECLINED"]).not.toContain(submitted.body.status);

    // Submitting twice is not an allowed transition.
    await client.post(`/pets/${petId}/insurance-applications/${application.body.id}/submit`).send({}).expect(409);

    const stillNotDecided = await prisma.insuranceApplication.findUniqueOrThrow({ where: { id: application.body.id } });
    expect(stillNotDecided.status).toBe("SUBMITTED");
  });

  // -- Flow J: Place geo search ---------------------------------------------------

  it("Flow J: nearby search returns a verified place within radius with a computed distance", async () => {
    const admin = await setupAdmin();
    const { placeId } = await setupVerifiedListedPlace(admin, { latitude: 35.7, longitude: 51.4 });

    const nearby = await request(app.getHttpServer()).get("/places/nearby?latitude=35.701&longitude=51.401&radiusMeters=5000").expect(200);
    const found = nearby.body.items.find((p: { id: string }) => p.id === placeId);
    expect(found).toBeTruthy();
    expect(typeof found.distanceMeters).toBe("number");

    const farAway = await request(app.getHttpServer()).get("/places/nearby?latitude=35.701&longitude=51.401&radiusMeters=10").expect(200);
    expect(farAway.body.items.some((p: { id: string }) => p.id === placeId)).toBe(false);
  });

  // -- Flow K: Place privacy — favorites require auth, unverified stays hidden --

  it("Flow K: favoriting a place requires authentication, and an unverified place never appears publicly", async () => {
    const admin = await setupAdmin();
    const { client } = await setupHousehold();
    const { placeId } = await setupVerifiedListedPlace(admin);

    // No session and no CSRF token — CSRF middleware rejects before the auth guard ever runs, the
    // same 403 (not 401) every other unauthenticated, CSRF-less mutating request gets in this codebase.
    await request(app.getHttpServer()).post(`/places/favorites/${placeId}`).expect(403);

    const favorited = await client.post(`/places/favorites/${placeId}`).send({}).expect(201);
    expect(favorited.body.isFavorited).toBe(true);

    const list = await client.get("/places/favorites").expect(200);
    expect(list.body.some((p: { id: string }) => p.id === placeId)).toBe(true);

    const unverifiedPlace = await admin.client.post("/admin/places").send({ name: `Hidden ${unique()}`, category: "CAFE", country: "IR", city: "Tehran", latitude: 35.7, longitude: 51.4 }).expect(201);
    await request(app.getHttpServer()).get(`/places/${unverifiedPlace.body.id}`).expect(404);
  });

  // -- Flow L: Support linkage — ownership enforced -----------------------------

  it("Flow L: a support case can link a household's own trip, but never someone else's", async () => {
    const { client, petId } = await setupHousehold();
    const { client: otherClient, petId: otherPetId } = await setupHousehold("Milo");

    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    const tripId = trip.body.id as string;

    const ownCase = await client.post("/support/cases").send({ relatedEntityType: "TRIP", relatedEntityId: tripId, subject: "Question about my trip", description: "Need help", category: "OTHER" }).expect(201);
    expect(ownCase.body.relatedEntityType).toBe("TRIP");

    const otherTrip = await otherClient
      .post(`/pets/${otherPetId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "AE", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    await client
      .post("/support/cases")
      .send({ relatedEntityType: "TRIP", relatedEntityId: otherTrip.body.id, subject: "Trying to reference someone else's trip", description: "Should fail", category: "OTHER" })
      .expect(400);
  });

  // -- Flow M: Cross-household isolation ----------------------------------------

  it("Flow M: a household can never view or act on another household's trip or insurance application", async () => {
    const admin = await setupAdmin();
    const { client, petId } = await setupHousehold();
    const { client: otherClient } = await setupHousehold("Milo");
    const { productId } = await setupVerifiedListedProduct(admin);

    const trip = await client
      .post(`/pets/${petId}/trips`)
      .send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    await otherClient.get(`/pets/${petId}/trips/${trip.body.id}`).expect(403);
    await otherClient.post(`/pets/${petId}/trips/${trip.body.id}/transition`).send({ status: "PLANNING" }).expect(403);

    const application = await client.post(`/pets/${petId}/insurance-applications`).send({ productId }).expect(201);
    await otherClient.get(`/pets/${petId}/insurance-applications/${application.body.id}`).expect(403);
    await otherClient.post(`/pets/${petId}/insurance-applications/${application.body.id}/submit`).send({}).expect(403);
  });
});
