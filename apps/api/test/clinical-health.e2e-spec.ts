import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import {
  AdminMembershipStatus,
  AdminRole,
  ClinicalVisitStatus,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  SourceType,
  SupportCaseCategory,
  SupportCaseStatus,
} from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { SupportCaseService } from "../src/modules/admin/support/support-case.service";

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
  };
}

/**
 * Handoff 17 — Advanced Health + Medical Documents + Clinical OS e2e flows
 * (mirrors subscription.e2e-spec.ts's own structure). Provider test setup
 * creates the PetAccessGrant directly via Prisma rather than driving a full
 * VET booking end-to-end — BookingPetAccessService's own grant-creation
 * logic (including the canRecordClinicalData flag it sets) is exercised by
 * H03/H04's existing booking test suites; this file's job is the clinical
 * domain built on top of whatever grant already exists.
 */
describe("Advanced Health + Medical Documents + Clinical OS (Handoff 17)", () => {
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

  async function setupHousehold() {
    const identifier = `h17-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id as string;
    const pet = await client.post(`/households/${householdId}/pets`).send({ name: "Luna", species: "DOG", approximateAgeMonths: 30 }).expect(201);
    return { client, householdId, ownerUserId: ownerUser.id as string, petId: pet.body.id as string };
  }

  /** A VERIFIED provider org with one staff member holding a direct PetAccessGrant for the given pet. */
  async function setupVetProvider(petId: string, flags: { canViewHealth?: boolean; canRecordClinicalData?: boolean } = { canViewHealth: true, canRecordClinicalData: true }) {
    const identifier = `h17-vet-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const vetUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const organization = await prisma.providerOrganization.create({
      data: { name: `H17 Vet Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED },
    });
    const providerUser = await prisma.providerUser.create({ data: { userId: vetUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.VET } });
    await prisma.petAccessGrant.create({
      data: {
        petId,
        userId: vetUser.id,
        canViewIdentity: true,
        canViewHealth: flags.canViewHealth ?? false,
        canRecordClinicalData: flags.canRecordClinicalData ?? false,
        source: "TEMPORARY",
        reason: "H17_TEST_GRANT",
      },
    });
    return { client, organization, providerUser, vetUserId: vetUser.id as string };
  }

  // -- Flow A: Owner Medical Document ---------------------------------------

  it("Flow A: authorized owner uploads a document, sees it in the record, and an unauthorized user is rejected", async () => {
    const { client, petId } = await setupHousehold();

    const uploadTarget = await client.post(`/pets/${petId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 1024 }).expect(201);
    expect(uploadTarget.body.key).toContain(`health-documents/${petId}/`);

    const doc = await client
      .post(`/pets/${petId}/health/documents`)
      .send({ key: uploadTarget.body.key, documentType: "OTHER", title: "Vet visit summary", mimeType: "application/pdf", fileSizeBytes: 1024 })
      .expect(201);
    expect(doc.body.sourceType).toBe("OWNER");
    expect(doc.body.verificationStatus).toBe("UNVERIFIED");

    const list = await client.get(`/pets/${petId}/health/documents`).expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toContain(doc.body.id);

    // A stranger household has no access at all.
    const { client: strangerClient } = await setupHousehold();
    await strangerClient.get(`/pets/${petId}/health/documents`).expect(403);
  });

  // -- Flow B: Provider Document ---------------------------------------------

  it("Flow B: a provider adds a clinical document, the owner sees provider provenance, and cannot overwrite the original", async () => {
    const { client, petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const uploadTarget = await vetClient.post(`/provider/patients/${petId}/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 2048 }).expect(201);
    const doc = await vetClient
      .post(`/provider/patients/${petId}/documents`)
      .send({ key: uploadTarget.body.key, documentType: "DISCHARGE_SUMMARY", title: "Discharge summary", mimeType: "application/pdf", fileSizeBytes: 2048 })
      .expect(201);
    expect(doc.body.sourceType).toBe("PROVIDER");
    expect(doc.body.verificationStatus).toBe("PROVIDER_VERIFIED");

    const ownerView = await client.get(`/pets/${petId}/health/documents/${doc.body.id}`).expect(200);
    expect(ownerView.body.source.providerOrganizationId).toBeTruthy();

    // The owner has no document-edit endpoint that mutates a provider row in place —
    // only void (retract) exists, and voiding still preserves the record rather than editing it.
    const voided = await client.post(`/pets/${petId}/health/documents/${doc.body.id}/void`).send({ reason: "Testing retraction" }).expect(201);
    expect(voided.body.voidedAt).toBeTruthy();
    expect(voided.body.title).toBe("Discharge summary"); // original content untouched
  });

  // -- Flow C: Owner Correction ------------------------------------------------

  it("Flow C: an owner correction is added alongside a provider-sourced allergy without altering the original", async () => {
    const { client, petId } = await setupHousehold();
    const { vetUserId } = await setupVetProvider(petId);

    const allergy = await prisma.allergy.create({ data: { petId, name: "Penicillin", sourceType: SourceType.PROVIDER, recordedByUserId: vetUserId } });

    // The owner cannot PATCH a PROVIDER-sourced allergy directly.
    await client.patch(`/pets/${petId}/health/allergies/${allergy.id}`).send({ name: "Amoxicillin" }).expect(403);

    const correction = await client.post(`/pets/${petId}/health/corrections`).send({ targetType: "ALLERGY", targetId: allergy.id, correctionText: "This should say Amoxicillin, not Penicillin." }).expect(201);
    expect(correction.body.status).toBe("OPEN");

    const stillOriginal = await prisma.allergy.findUniqueOrThrow({ where: { id: allergy.id } });
    expect(stillOriginal.name).toBe("Penicillin");

    const history = await client.get(`/pets/${petId}/health/corrections`).expect(200);
    expect(history.body.map((c: { id: string }) => c.id)).toContain(correction.body.id);
  });

  // -- Flow D: Unknown Semantics ------------------------------------------------

  it("Flow D: no lab result yields an empty list, never a fabricated normal result", async () => {
    const { client, petId } = await setupHousehold();
    const labs = await client.get(`/pets/${petId}/health/labs`).expect(200);
    expect(labs.body).toEqual([]);
  });

  // -- Flow E + F: Clinical Visit + Amendment -----------------------------------

  it("Flow E + F: a provider starts, documents, completes a visit, then amends it with a preserved revision", async () => {
    const { petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const started = await vetClient.post("/provider/visits").send({ petId, reasonForVisit: "Annual checkup" }).expect(201);
    expect(started.body.status).toBe(ClinicalVisitStatus.IN_PROGRESS);
    const visitId = started.body.id as string;

    await vetClient.post(`/provider/patients/${petId}/visits/${visitId}/notes`).send({ assessmentText: "Healthy overall" }).expect(201);
    const completed = await vetClient.post(`/provider/patients/${petId}/visits/${visitId}/complete`).expect(201);
    expect(completed.body.status).toBe(ClinicalVisitStatus.COMPLETED);

    // Cannot silently mutate a completed visit via the notes endpoint.
    await vetClient.post(`/provider/patients/${petId}/visits/${visitId}/notes`).send({ assessmentText: "Silently changed" }).expect(409);

    const amended = await vetClient.post(`/provider/patients/${petId}/visits/${visitId}/amend`).send({ assessmentText: "Corrected: mild ear infection noted", reason: "Missed finding on first pass" }).expect(201);
    expect(amended.body.status).toBe(ClinicalVisitStatus.AMENDED);
    expect(amended.body.assessmentText).toBe("Corrected: mild ear infection noted");
    expect(amended.body.revisions).toHaveLength(1);
    expect(amended.body.revisions[0].snapshotAssessmentText).toBe("Healthy overall");
  });

  // -- Flow G: Lab -----------------------------------------------------------

  it("Flow G: a recorded lab result appears in the timeline with correct provenance", async () => {
    const { client, petId } = await setupHousehold();
    const { client: vetClient, organization } = await setupVetProvider(petId);

    const lab = await vetClient.post("/provider/labs").send({ petId, testName: "CBC Panel", value: "Normal range", resultDate: new Date().toISOString() }).expect(201);
    expect(lab.body.sourceType).toBe("PROVIDER");
    expect(lab.body.source.providerOrganizationId).toBe(organization.id);

    const timeline = await client.get(`/pets/${petId}/health/timeline`).expect(200);
    expect(timeline.body.some((e: { recordType: string; recordId: string }) => e.recordType === "LAB_RESULT" && e.recordId === lab.body.id)).toBe(true);
  });

  // -- Flow H: Imaging ----------------------------------------------------------

  it("Flow H: an imaging study's private file is downloadable by an authorized viewer and rejected for an unauthorized one", async () => {
    const { client, petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const study = await vetClient.post("/provider/imaging").send({ petId, studyType: "XRAY", report: "No abnormalities detected" }).expect(201);
    expect(study.body.report).toBe("No abnormalities detected");

    const uploadTarget = await client.post(`/pets/${petId}/health/documents/upload-url`).send({ contentType: "image/png", fileSizeBytes: 512 }).expect(201);
    const doc = await client
      .post(`/pets/${petId}/health/documents`)
      .send({ key: uploadTarget.body.key, documentType: "IMAGING_REPORT", title: "X-ray image", mimeType: "image/png", fileSizeBytes: 512, relatedImagingStudyId: study.body.id })
      .expect(201);
    const download = await client.get(`/pets/${petId}/health/documents/${doc.body.id}/download`).expect(200);
    expect(download.body.downloadUrl).toBeTruthy();

    const { client: strangerClient } = await setupHousehold();
    await strangerClient.get(`/pets/${petId}/health/documents/${doc.body.id}/download`).expect(403);
  });

  // -- Flow I: Referral -----------------------------------------------------------

  it("Flow I: a provider-created referral progresses through its own states, independent of Booking", async () => {
    const { client, petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const referral = await vetClient.post("/provider/referrals").send({ petId, reason: "Suspected cruciate ligament tear", externalProviderName: "Specialty Ortho Clinic" }).expect(201);
    expect(referral.body.status).toBe("CREATED");

    const sent = await vetClient.patch(`/provider/referrals/${referral.body.id}/status`).send({ petId, status: "SENT" }).expect(200);
    expect(sent.body.status).toBe("SENT");

    const list = await client.get(`/pets/${petId}/health/referrals`).expect(200);
    expect(list.body.find((r: { id: string }) => r.id === referral.body.id).status).toBe("SENT");

    // No Booking row was ever touched by this flow.
    const bookingCount = await prisma.booking.count({ where: { petId } });
    expect(bookingCount).toBe(0);
  });

  // -- Flow J: Care Plan -----------------------------------------------------------

  it("Flow J: a provider-created care plan and its items are visible to the owner", async () => {
    const { client, petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const plan = await vetClient
      .post("/provider/care-plans")
      .send({ petId, title: "Post-op recovery plan", items: [{ type: "FOLLOW_UP", title: "Recheck in 2 weeks", dueAt: new Date(Date.now() + 14 * 86400000).toISOString() }] })
      .expect(201);
    expect(plan.body.items).toHaveLength(1);

    const ownerView = await client.get(`/pets/${petId}/health/care-plans`).expect(200);
    expect(ownerView.body.find((p: { id: string }) => p.id === plan.body.id).items[0].title).toBe("Recheck in 2 weeks");
  });

  // -- Flow K: Owner Observation -----------------------------------------------------------

  it("Flow K: an owner-recorded observation is labeled as an observation, never converted into a diagnosis", async () => {
    const { client, petId } = await setupHousehold();

    const observation = await client.post(`/pets/${petId}/observations`).send({ category: "APPETITE", description: "Ate less than usual today", observedAt: new Date().toISOString() }).expect(201);
    expect(observation.body.sourceType).toBe("OWNER");

    // Never silently becomes a Condition row.
    const conditions = await prisma.condition.findMany({ where: { petId } });
    expect(conditions).toHaveLength(0);
  });

  // -- Flow L: Subscription entitlement gating -----------------------------------------------------------

  it("Flow L: exceeding the health.documents.max limit is rejected, but existing documents remain fully accessible", async () => {
    const { client, householdId, petId } = await setupHousehold();
    const adminUserForOverride = await prisma.user.create({ data: { email: `h17-super-${unique()}@example.com`, displayName: "H17 Test Admin" } });
    const superAdmin = await prisma.adminUser.create({ data: { userId: adminUserForOverride.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    await prisma.subscriptionEntitlementOverride.create({
      data: { householdId, key: "health.documents.max", type: "LIMIT", limitValue: 1, reason: "H17 test — force a low limit", createdByAdminId: superAdmin.id },
    });

    const firstUpload = await client.post(`/pets/${petId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201);
    const firstDoc = await client.post(`/pets/${petId}/health/documents`).send({ key: firstUpload.body.key, documentType: "OTHER", title: "Doc 1", mimeType: "application/pdf", fileSizeBytes: 100 }).expect(201);

    const secondUpload = await client.post(`/pets/${petId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201);
    await client.post(`/pets/${petId}/health/documents`).send({ key: secondUpload.body.key, documentType: "OTHER", title: "Doc 2", mimeType: "application/pdf", fileSizeBytes: 100 }).expect(409);

    // The existing document remains fully accessible despite the limit.
    await client.get(`/pets/${petId}/health/documents/${firstDoc.body.id}`).expect(200);
  });

  // -- Flow M: Support Privacy -----------------------------------------------------------

  it("Flow M: a support case's health context is a coarse summary only, never the full clinical record", async () => {
    const { petId, householdId, ownerUserId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);
    await vetClient.post("/provider/labs").send({ petId, testName: "Sensitive test result" }).expect(201);
    const uploadTarget = await vetClient.post(`/provider/patients/${petId}/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201);
    await vetClient.post(`/provider/patients/${petId}/documents`).send({ key: uploadTarget.body.key, documentType: "OTHER", title: "Very sensitive diagnosis details", mimeType: "application/pdf", fileSizeBytes: 100 }).expect(201);

    const supportCase = await prisma.supportCase.create({
      data: { caseNumber: `H17-${unique()}`, requesterUserId: ownerUserId, householdId, petId, subject: "Question about my pet's care", description: "...", category: SupportCaseCategory.OTHER, status: SupportCaseStatus.OPEN },
    });

    const context = await app.get(SupportCaseService).getContext(supportCase.id);
    expect(context.health).toEqual({ openMedicalDocumentsCount: 1, recentClinicalVisit: null, openReferralsCount: 0 });
    // Never the document's title or the lab's test name/value.
    expect(JSON.stringify(context)).not.toContain("Very sensitive diagnosis details");
    expect(JSON.stringify(context)).not.toContain("Sensitive test result");
  });

  // -- Flow N: Cross-Household isolation -----------------------------------------------------------

  it("Flow N: Household A cannot access Household B's medical data", async () => {
    const { petId: petA } = await setupHousehold();
    const { client: clientB } = await setupHousehold();

    await clientB.get(`/pets/${petA}/health/documents`).expect(403);
    await clientB.get(`/pets/${petA}/health`).expect(403);
    await clientB.post(`/pets/${petA}/observations`).send({ category: "OTHER", description: "x", observedAt: new Date().toISOString() }).expect(403);
  });

  // -- Flow O: Provider Isolation -----------------------------------------------------------

  it("Flow O: Provider A cannot access a pet through Provider B's unrelated grant", async () => {
    const { petId } = await setupHousehold();
    await setupVetProvider(petId); // Provider A — has a real grant
    const { client: providerBClient } = await setupVetProvider((await setupHousehold()).petId); // Provider B — grant is for a DIFFERENT pet entirely

    await providerBClient.get(`/provider/patients/${petId}`).expect(403);
  });

  // -- Flow P: Concurrent Amendment -----------------------------------------------------------

  it("Flow P: two concurrent visit-completion attempts never both succeed — no silent lost update", async () => {
    const { petId } = await setupHousehold();
    const { client: vetClient } = await setupVetProvider(petId);

    const started = await vetClient.post("/provider/visits").send({ petId, reasonForVisit: "Concurrency test" }).expect(201);
    const visitId = started.body.id as string;

    const results = await Promise.allSettled([
      vetClient.post(`/provider/patients/${petId}/visits/${visitId}/complete`),
      vetClient.post(`/provider/patients/${petId}/visits/${visitId}/complete`),
    ]);
    const statuses = results.map((r) => (r.status === "fulfilled" ? r.value.status : -1));
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const finalVisit = await prisma.clinicalVisit.findUniqueOrThrow({ where: { id: visitId } });
    expect(finalVisit.status).toBe(ClinicalVisitStatus.COMPLETED);
  });
});
