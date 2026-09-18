import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { MedicationStatus, ProviderType, ProviderUserRole, ProviderVerificationStatus } from "@prisma/client";
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
  return { session: extractCookie(verifyRes.headers["set-cookie"], "petlife_session"), csrf: primed.csrf };
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
 * Handoff 24 — Veterinary Clinical Panel e2e flows.
 *
 * Follows clinical-health.e2e-spec.ts's structure exactly, including creating
 * the provider's PetAccessGrant directly via Prisma: BookingPetAccessService's
 * own grant creation (and the canRecordClinicalData flag it sets for a VET
 * booking) is already covered by the H03/H04 booking suites, so this file
 * tests the practice layer built on top of whatever grant exists rather than
 * re-testing grant issuance.
 */
describe("Veterinary Clinical Panel (Handoff 24)", () => {
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

  async function setupHousehold(petName = "Luna") {
    const identifier = `h24-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id as string;
    const pet = await client.post(`/households/${householdId}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 36 }).expect(201);
    return { client, householdId, petId: pet.body.id as string };
  }

  async function setupVetProvider(petId: string, flags: { canViewHealth?: boolean; canRecordClinicalData?: boolean; canBookCare?: boolean } = { canViewHealth: true, canRecordClinicalData: true }) {
    const identifier = `h24-vet-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const vetUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const organization = await prisma.providerOrganization.create({
      data: { name: `H24 Vet Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED },
    });
    const providerUser = await prisma.providerUser.create({ data: { userId: vetUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.VET, displayTitle: "Dr. Test" } });
    await prisma.petAccessGrant.create({
      data: {
        petId,
        userId: vetUser.id,
        canViewIdentity: true,
        canViewHealth: flags.canViewHealth ?? false,
        canRecordClinicalData: flags.canRecordClinicalData ?? false,
        canBookCare: flags.canBookCare ?? false,
        source: "TEMPORARY",
        reason: "H24_TEST_GRANT",
      },
    });
    return { client, organization, providerUser, vetUserId: vetUser.id as string };
  }

  /** A started visit is the cheapest way to put a pet into an organisation's caseload. */
  async function startVisit(vet: ReturnType<typeof authedRequest>, petId: string): Promise<string> {
    const res = await vet.post("/provider/visits").send({ petId, reasonForVisit: "Annual wellness" }).expect(201);
    return res.body.id as string;
  }

  // -------------------------------------------------------------------------
  // Flow A — patient registry
  // -------------------------------------------------------------------------

  describe("Flow A — patient registry", () => {
    it("lists a pet the organisation has documented, with a live access badge, and never another clinic's patient", async () => {
      const { petId } = await setupHousehold("Registry Dog");
      const vet = await setupVetProvider(petId);
      await startVisit(vet.client, petId);

      const listed = await vet.client.get("/provider/clinical/patients").expect(200);
      expect(listed.body.total).toBe(1);
      const row = listed.body.items[0];
      expect(row.petId).toBe(petId);
      expect(row.name).toBe("Registry Dog");
      expect(row.accessState).toBe("ACTIVE");
      expect(row.visitCount).toBe(1);
      // A directory row carries no clinical content.
      expect(Object.keys(row)).not.toContain("allergies");

      // A second clinic with no relationship to this pet sees an empty registry.
      const { petId: otherPetId } = await setupHousehold("Other Dog");
      const otherVet = await setupVetProvider(otherPetId);
      const otherListed = await otherVet.client.get("/provider/clinical/patients").expect(200);
      expect(otherListed.body.items.map((p: { petId: string }) => p.petId)).not.toContain(petId);
    });

    it("reports EXPIRED rather than hiding a patient once the visit-scoped grant lapses, and the record itself stays refused", async () => {
      const { petId } = await setupHousehold("Lapsed Dog");
      const vet = await setupVetProvider(petId);
      await startVisit(vet.client, petId);

      await prisma.petAccessGrant.updateMany({ where: { petId, userId: vet.vetUserId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const listed = await vet.client.get("/provider/clinical/patients").expect(200);
      expect(listed.body.items[0].petId).toBe(petId);
      expect(listed.body.items[0].accessState).toBe("EXPIRED");

      // The directory is not an authorization decision — PetAccessGuard still refuses.
      await vet.client.get(`/provider/clinical/patients/${petId}`).expect(403);
    });

    it("searches by pet name", async () => {
      const { petId } = await setupHousehold("Pistachio");
      const vet = await setupVetProvider(petId);
      await startVisit(vet.client, petId);

      const hit = await vet.client.get("/provider/clinical/patients?q=stach").expect(200);
      expect(hit.body.total).toBe(1);
      const miss = await vet.client.get("/provider/clinical/patients?q=zzzznothing").expect(200);
      expect(miss.body.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Flow B — vitals
  // -------------------------------------------------------------------------

  describe("Flow B — vitals and trends", () => {
    it("records vitals, updates the pet's current weight, and projects trends without inventing points", async () => {
      const { petId, client: owner } = await setupHousehold();
      const vet = await setupVetProvider(petId);

      await vet.client.post("/provider/clinical/vitals").send({ petId, weightValue: 12.4, weightUnit: "KG", temperatureC: 38.6, heartRateBpm: 96, bodyConditionScore: 5, bodyConditionScale: "Purina 1-9" }).expect(201);
      await vet.client.post("/provider/clinical/vitals").send({ petId, weightValue: 12.9, weightUnit: "KG", heartRateBpm: 88 }).expect(201);

      const pet = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
      expect(Number(pet.latestWeightValue)).toBeCloseTo(12.9);

      const trends = await vet.client.get(`/provider/clinical/patients/${petId}/vitals/trends`).expect(200);
      expect(trends.body.weightKg).toHaveLength(2);
      // Only one reading carried a temperature — the series has one point, not two.
      expect(trends.body.temperatureC).toHaveLength(1);
      expect(trends.body.painScore).toHaveLength(0);

      // The owner reads the same rows through their own route.
      const ownerVitals = await owner.get(`/pets/${petId}/clinical/vitals`).expect(200);
      expect(ownerVitals.body).toHaveLength(2);
    });

    it("rejects a score the named scale cannot express", async () => {
      const { petId } = await setupHousehold();
      const vet = await setupVetProvider(petId);
      await vet.client.post("/provider/clinical/vitals").send({ petId, bodyConditionScore: 12 }).expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // Flow C — problem list
  // -------------------------------------------------------------------------

  describe("Flow C — master problem list", () => {
    it("stamps resolvedAt on close and clears it on reopen", async () => {
      const { petId } = await setupHousehold();
      const vet = await setupVetProvider(petId);

      const created = await vet.client.post("/provider/clinical/problems").send({ petId, name: "Chronic otitis externa", bodySystem: "Ear" }).expect(201);
      expect(created.body.status).toBe("ACTIVE");
      expect(created.body.resolvedAt).toBeNull();

      const resolved = await vet.client.patch(`/provider/clinical/patients/${petId}/problems/${created.body.id}`).send({ petId, status: "RESOLVED" }).expect(200);
      expect(resolved.body.resolvedAt).not.toBeNull();

      const reopened = await vet.client.patch(`/provider/clinical/patients/${petId}/problems/${created.body.id}`).send({ petId, status: "ACTIVE" }).expect(200);
      expect(reopened.body.resolvedAt).toBeNull();
    });

    it("refuses to let a second clinic edit another organisation's problem", async () => {
      const { petId } = await setupHousehold();
      const vetA = await setupVetProvider(petId);
      const vetB = await setupVetProvider(petId);

      const created = await vetA.client.post("/provider/clinical/problems").send({ petId, name: "Suspected IBD" }).expect(201);
      await vetB.client.patch(`/provider/clinical/patients/${petId}/problems/${created.body.id}`).send({ petId, status: "RULED_OUT" }).expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // Flow D — prescriptions
  // -------------------------------------------------------------------------

  describe("Flow D — prescriptions", () => {
    it("creates the owner-facing Medication row, retires it on cancellation, and never leaks internal notes to the owner", async () => {
      const { petId, client: owner } = await setupHousehold();
      const vet = await setupVetProvider(petId);

      const created = await vet.client
        .post("/provider/clinical/prescriptions")
        .send({ petId, drugName: "Meloxicam", strength: "1.5 mg/ml", route: "ORAL", doseAmount: 0.1, doseUnit: "mg/kg", frequencyText: "Once daily", refillsAuthorized: 1, internalNotes: "Owner is unreliable with dosing" })
        .expect(201);

      expect(created.body.medicationId).not.toBeNull();
      expect(created.body.internalNotes).toBe("Owner is unreliable with dosing");
      const medication = await prisma.medication.findUniqueOrThrow({ where: { id: created.body.medicationId } });
      expect(medication.status).toBe(MedicationStatus.ACTIVE);
      expect(medication.sourceType).toBe("PROVIDER");

      const ownerView = await owner.get(`/pets/${petId}/clinical/prescriptions`).expect(200);
      expect(ownerView.body[0].drugName).toBe("Meloxicam");
      expect(ownerView.body[0]).not.toHaveProperty("internalNotes");

      await vet.client.post(`/provider/clinical/prescriptions/${created.body.id}/refill`).send({ petId }).expect(201);
      // One refill was authorised; the second attempt is a conflict, not a silent no-op.
      await vet.client.post(`/provider/clinical/prescriptions/${created.body.id}/refill`).send({ petId }).expect(409);

      await vet.client.post(`/provider/clinical/prescriptions/${created.body.id}/cancel`).send({ petId, reason: "Adverse reaction" }).expect(201);
      const retired = await prisma.medication.findUniqueOrThrow({ where: { id: created.body.medicationId } });
      expect(retired.status).toBe(MedicationStatus.HISTORICAL);
      // Cancelling twice is a conflict — the prescription is not deleted, it has a terminal state.
      await vet.client.post(`/provider/clinical/prescriptions/${created.body.id}/cancel`).send({ petId, reason: "again" }).expect(409);
    });
  });

  // -------------------------------------------------------------------------
  // Flow E — hospitalization and the treatment sheet
  // -------------------------------------------------------------------------

  describe("Flow E — hospitalization and treatment sheet", () => {
    it("admits once, expands a treatment series into real rows, records who actioned each, and discharges", async () => {
      const { petId } = await setupHousehold("Inpatient");
      const vet = await setupVetProvider(petId);

      const admission = await vet.client.post("/provider/clinical/hospitalizations").send({ petId, reasonForAdmission: "Post-operative monitoring", kennelLabel: "K3", triageLevel: "URGENT" }).expect(201);
      const hospitalizationId = admission.body.id as string;

      // A second live admission for the same patient is a conflict, not a second stay.
      await vet.client.post("/provider/clinical/hospitalizations").send({ petId, reasonForAdmission: "Duplicate" }).expect(409);

      const startAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const series = await vet.client
        .post(`/provider/clinical/hospitalizations/${hospitalizationId}/task-series`)
        .send({ petId, type: "MEDICATION", title: "Buprenorphine", startAt, everyHours: 8, occurrences: 3 })
        .expect(201);
      expect(series.body).toHaveLength(3);

      const detail = await vet.client.get(`/provider/clinical/patients/${petId}/hospitalizations/${hospitalizationId}`).expect(200);
      expect(detail.body.taskCounts.scheduled).toBe(3);
      // The first dose is in the past and nobody has actioned it — overdue is derived, never stored.
      expect(detail.body.taskCounts.overdue).toBe(1);
      expect(detail.body.tasks[0].status).toBe("SCHEDULED");

      const firstTaskId = detail.body.tasks[0].id as string;
      const actioned = await vet.client.post(`/provider/clinical/hospitalizations/${hospitalizationId}/tasks/${firstTaskId}/action`).send({ petId, status: "DONE", outcomeNote: "Given IV" }).expect(201);
      expect(actioned.body.completedByProviderUserId).toBe(vet.providerUser.id);
      expect(actioned.body.isOverdue).toBe(false);

      // Re-stating a recorded act of care is refused rather than overwriting it.
      await vet.client.post(`/provider/clinical/hospitalizations/${hospitalizationId}/tasks/${firstTaskId}/action`).send({ petId, status: "SKIPPED" }).expect(409);
      // SCHEDULED is not a terminal outcome and can never be written back.
      const secondTaskId = detail.body.tasks[1].id as string;
      await vet.client.post(`/provider/clinical/hospitalizations/${hospitalizationId}/tasks/${secondTaskId}/action`).send({ petId, status: "SCHEDULED" }).expect(409);

      const board = await vet.client.get("/provider/clinical/dashboard").expect(200);
      expect(board.body.whiteboard).toHaveLength(1);
      expect(board.body.whiteboard[0].hospitalization.id).toBe(hospitalizationId);
      expect(board.body.whiteboard[0].dueTaskCount).toBe(2);

      await vet.client.post(`/provider/clinical/hospitalizations/${hospitalizationId}/discharge`).send({ petId, dischargeNote: "Stable" }).expect(201);
      await vet.client.post(`/provider/clinical/hospitalizations/${hospitalizationId}/discharge`).send({ petId }).expect(409);

      // Outstanding tasks are left exactly as they were — discharge never fabricates an outcome.
      const afterDischarge = await vet.client.get(`/provider/clinical/patients/${petId}/hospitalizations/${hospitalizationId}`).expect(200);
      expect(afterDischarge.body.taskCounts.scheduled).toBe(2);
      expect(afterDischarge.body.taskCounts.missed).toBe(0);

      const emptyBoard = await vet.client.get("/provider/clinical/dashboard").expect(200);
      expect(emptyBoard.body.whiteboard).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Flow F — estimates
  // -------------------------------------------------------------------------

  describe("Flow F — estimates and owner approval", () => {
    it("totals lines as integer IRR, freezes on presentation, and only the owner can approve", async () => {
      const { petId, client: owner } = await setupHousehold();
      const vet = await setupVetProvider(petId);

      const created = await vet.client
        .post("/provider/clinical/estimates")
        .send({
          petId,
          title: "Dental under GA",
          lines: [
            { description: "General anaesthesia", quantity: 1, unitLowIrr: 4_000_000, unitHighIrr: 6_000_000 },
            { description: "Dental extraction", quantity: 3, unitLowIrr: 1_500_000, unitHighIrr: 2_500_000 },
          ],
        })
        .expect(201);

      expect(created.body.lowTotalIrr).toBe(8_500_000);
      expect(created.body.highTotalIrr).toBe(13_500_000);
      expect(created.body.status).toBe("DRAFT");

      // The owner cannot see a decision they have not been asked to make yet — but the draft is visible as part of their record.
      const presented = await vet.client.post(`/provider/clinical/estimates/${created.body.id}/present`).send({ petId }).expect(201);
      expect(presented.body.status).toBe("PRESENTED");
      expect(presented.body.presentedAt).not.toBeNull();

      // A presented estimate's numbers no longer move.
      await vet.client.patch(`/provider/clinical/estimates/${created.body.id}`).send({ petId, title: "Changed" }).expect(409);

      // There is no provider route that can approve — the clinic cannot consent on the household's behalf.
      await vet.client.post(`/pets/${petId}/clinical/estimates/${created.body.id}/approve`).send({}).expect(403);

      const approved = await owner.post(`/pets/${petId}/clinical/estimates/${created.body.id}/approve`).send({}).expect(201);
      expect(approved.body.status).toBe("APPROVED");
      expect(approved.body.respondedAt).not.toBeNull();

      // Answering twice is a conflict, so a double-tap cannot record two different answers.
      await owner.post(`/pets/${petId}/clinical/estimates/${created.body.id}/decline`).send({ declineReason: "changed my mind" }).expect(409);
    });
  });

  // -------------------------------------------------------------------------
  // Flow G — discharge summary
  // -------------------------------------------------------------------------

  describe("Flow G — discharge summary immutability", () => {
    it("keeps a draft private, becomes immutable once issued, and only then reaches the owner", async () => {
      const { petId, client: owner } = await setupHousehold();
      const vet = await setupVetProvider(petId);
      const visitId = await startVisit(vet.client, petId);

      await vet.client
        .post(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary`)
        .send({ summaryText: "Recovered well", homeCareInstructions: "Rest for 48h", warningSignsText: "Call us if vomiting persists" })
        .expect(201);

      // A draft is the clinic's working copy — the owner sees nothing yet.
      const beforeIssue = await owner.get(`/pets/${petId}/clinical/discharge-summaries`).expect(200);
      expect(beforeIssue.body).toHaveLength(0);

      const issued = await vet.client.post(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary/issue`).send({}).expect(201);
      expect(issued.body.status).toBe("ISSUED");
      expect(issued.body.issuedAt).not.toBeNull();

      // Once the owner has it, it cannot be rewritten under them.
      await vet.client.post(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary`).send({ summaryText: "Actually, something else" }).expect(409);
      await vet.client.post(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary/issue`).send({}).expect(409);

      const afterIssue = await owner.get(`/pets/${petId}/clinical/discharge-summaries`).expect(200);
      expect(afterIssue.body).toHaveLength(1);
      expect(afterIssue.body[0].summaryText).toBe("Recovered well");
    });
  });

  // -------------------------------------------------------------------------
  // Flow H — staff-safety alerts stay inside the clinic
  // -------------------------------------------------------------------------

  describe("Flow H — staff-safety alerts", () => {
    it("is visible to the authoring clinic, invisible to another clinic, and has no consumer endpoint at all", async () => {
      const { petId, client: owner } = await setupHousehold();
      const vetA = await setupVetProvider(petId);
      const vetB = await setupVetProvider(petId);

      await vetA.client.post("/provider/clinical/alerts").send({ petId, type: "HANDLING", severity: "CRITICAL", message: "Muzzle required for nail trims" }).expect(201);

      const mine = await vetA.client.get(`/provider/clinical/patients/${petId}/alerts`).expect(200);
      expect(mine.body).toHaveLength(1);
      const theirs = await vetB.client.get(`/provider/clinical/patients/${petId}/alerts`).expect(200);
      expect(theirs.body).toHaveLength(0);

      // The patient record the authoring clinic reads carries the banner...
      const record = await vetA.client.get(`/provider/clinical/patients/${petId}`).expect(200);
      expect(record.body.alerts).toHaveLength(1);
      // ...and no consumer route exposes it.
      await owner.get(`/pets/${petId}/clinical/alerts`).expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Flow I — authorization
  // -------------------------------------------------------------------------

  describe("Flow I — authorization", () => {
    it("lets a read-only grant read but never author", async () => {
      const { petId } = await setupHousehold();
      const readOnly = await setupVetProvider(petId, { canViewHealth: true, canRecordClinicalData: false });

      await readOnly.client.get(`/provider/clinical/patients/${petId}`).expect(200);
      await readOnly.client.post("/provider/clinical/vitals").send({ petId, heartRateBpm: 80 }).expect(403);
      await readOnly.client.post("/provider/clinical/problems").send({ petId, name: "Should not be recorded" }).expect(403);
      await readOnly.client.post("/provider/clinical/hospitalizations").send({ petId, reasonForAdmission: "Should not admit" }).expect(403);
    });

    it("refuses a provider with no grant for the pet at all", async () => {
      const { petId } = await setupHousehold();
      const stranger = await setupVetProvider(petId, { canViewHealth: false, canRecordClinicalData: false });
      await stranger.client.get(`/provider/clinical/patients/${petId}`).expect(403);
    });
  });
});
