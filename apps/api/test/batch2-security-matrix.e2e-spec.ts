import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { CareReminderWorker } from "../src/modules/care-reminders/care-reminder.worker";
import { CareSourceListener } from "../src/modules/care-reminders/care-source.listener";

/**
 * Batch 2 closing matrix: sensitive mutations per actor class, forged identifiers on every
 * detail route, document signing, share lifecycle, notification phases, source projection
 * and entitlement downgrade. Read-route actor coverage lives in batch2-care-share.e2e-spec.ts.
 */
describe("Batch 2 security matrix", () => {
  let app: INestApplication, db: PrismaService;
  let householdId: string, petId: string, otherPetId: string, otherHouseholdId: string, providerId: string;
  const actors: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const own: Record<string, string> = {};
  const foreign: Record<string, string> = {};
  let anonCsrf = "";

  const ACTORS = ["OWNER", "AUTHORIZED_MEMBER", "VIEW_ONLY_MEMBER", "REVOKED_MEMBER", "EXPIRED_GRANT", "UNRELATED_HOUSEHOLD", "VET", "OTHER_VET"] as const;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    for (const name of ACTORS) {
      const user = await db.user.create({ data: { displayName: name, email: `b2m-${randomUUID()}@example.com` } });
      const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
      const res = await request(app.getHttpServer()).get("/health/live");
      const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
      actors[name] = { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
    }
    anonCsrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;

    const household = await db.household.create({ data: { name: "خانواده ماتریس" } });
    householdId = household.id;
    const other = await db.household.create({ data: { name: "خانواده دیگر" } });
    otherHouseholdId = other.id;
    await db.householdMember.create({ data: { householdId, userId: actors.OWNER!.id, role: "OWNER" } });
    await db.householdMember.create({ data: { householdId: otherHouseholdId, userId: actors.UNRELATED_HOUSEHOLD!.id, role: "OWNER" } });
    petId = (await db.pet.create({ data: { householdId, name: "پاپر", species: "DOG" } })).id;
    otherPetId = (await db.pet.create({ data: { householdId: otherHouseholdId, name: "میشی", species: "CAT" } })).id;

    const full = { canViewIdentity: true, canViewHealth: true, canEditHealth: true, canViewCareProfile: true, canEditCareProfile: true };
    await db.petAccessGrant.create({ data: { petId, userId: actors.OWNER!.id, ...full, canManageAccess: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.AUTHORIZED_MEMBER!.id, ...full } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.VIEW_ONLY_MEMBER!.id, canViewIdentity: true, canViewHealth: true, canViewCareProfile: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.REVOKED_MEMBER!.id, ...full, revokedAt: new Date() } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.EXPIRED_GRANT!.id, ...full, expiresAt: new Date(Date.now() - 1000) } });
    await db.petAccessGrant.create({ data: { petId: otherPetId, userId: actors.UNRELATED_HOUSEHOLD!.id, ...full, canManageAccess: true } });

    const org = await db.providerOrganization.create({ data: { name: "کلینیک ماتریس", type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    providerId = (await db.providerUser.create({ data: { userId: actors.VET!.id, providerOrganizationId: org.id, role: "VET" } })).id;
    await db.providerUser.create({ data: { userId: actors.OTHER_VET!.id, providerOrganizationId: org.id, role: "VET" } });

    for (const [target, id, hh] of [[own, petId, householdId], [foreign, otherPetId, otherHouseholdId]] as const) {
      target.condition = (await db.condition.create({ data: { petId: id, name: "درماتیت آتوپیک" } })).id;
      target.allergy = (await db.allergy.create({ data: { petId: id, name: "مرغ" } })).id;
      target.medication = (await db.medication.create({ data: { petId: id, name: "Apoquel", status: "ACTIVE" } })).id;
      target.lab = (await db.labResult.create({ data: { petId: id, testName: "CBC" } })).id;
      target.imaging = (await db.imagingStudy.create({ data: { petId: id, studyType: "XRAY" } })).id;
      target.referral = (await db.referral.create({ data: { petId: id, fromProviderOrganizationId: org.id, reason: "ارجاع پوست" } })).id;
      target.dental = (await db.dentalRecord.create({ data: { petId: id, recordType: "EXAM" } })).id;
      target.nutrition = (await db.clinicalNutritionPlan.create({ data: { petId: id, providerOrganizationId: org.id } })).id;
      target.rehab = (await db.rehabPlan.create({ data: { petId: id, providerOrganizationId: org.id } })).id;
      target.observation = (await db.petObservation.create({ data: { petId: id, category: "SYMPTOM", description: "خارش گوش", observedAt: new Date(), sourceType: "OWNER", recordedByUserId: actors.OWNER!.id } })).id;
      target.visit = (await db.clinicalVisit.create({ data: { petId: id, householdId: hh, providerOrganizationId: org.id, providerUserId: providerId } })).id;
      target.document = (await db.medicalDocument.create({ data: { petId: id, householdId: hh, documentType: "LAB_REPORT", title: "نتیجه CBC", sourceType: "OWNER", fileObjectKey: `health-documents/${id}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12 } })).id;
      target.care = (await db.careReminder.create({ data: { petId: id, createdByUserId: actors.OWNER!.id, title: "کنترل وزن", type: "WEIGHT_CHECK", dueAt: new Date(Date.now() + 5 * 86400000), originalDueAt: new Date(Date.now() + 5 * 86400000) } })).id;
    }
    own.document2 = (await db.medicalDocument.create({ data: { petId, householdId, documentType: "OTHER", title: "سند دوم", sourceType: "OWNER", fileObjectKey: `health-documents/${petId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12 } })).id;
  });
  afterAll(async () => { await app?.close(); });

  const server = () => app.getHttpServer();
  const get = (actor: string, url: string) => request(server()).get(url).set("Cookie", actors[actor]!.cookie);
  const send = (method: "post" | "patch", actor: string | null, url: string) =>
    actor ? request(server())[method](url).set("Cookie", actors[actor]!.cookie).set("x-csrf-token", actors[actor]!.csrf)
      : request(server())[method](url).set("Cookie", `petlife_csrf=${anonCsrf}`).set("x-csrf-token", anonCsrf);
  const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

  describe("sensitive mutations per actor class", () => {
    const denied = ["REVOKED_MEMBER", "EXPIRED_GRANT", "UNRELATED_HOUSEHOLD"];
    const cases: [string, "post" | "patch", () => string, () => object][] = [
      ["create care item", "post", () => `/pets/${petId}/care-items`, () => ({ title: "داروی ضدانگل", type: "DEWORMING", dueAt: future(48) })],
      ["edit care item", "patch", () => `/pets/${petId}/care-items/${own.care}`, () => ({ title: "کنترل وزن ماهانه" })],
      ["snooze care item", "post", () => `/pets/${petId}/care-items/${own.care}/actions`, () => ({ action: "SNOOZE", at: future(3) })],
      ["record owner observation", "post", () => `/pets/${petId}/observations`, () => ({ category: "APPETITE", description: "کم‌اشتهایی", observedAt: new Date().toISOString() })],
      ["preview vet share", "post", () => `/pets/${petId}/vet-shares/preview`, () => ({ providerUserId: providerId, scopes: ["ALLERGIES"], documentIds: [], startsAt: new Date().toISOString(), expiresAt: future(24) })],
    ];
    it.each(cases)("%s: denied for revoked, expired, unrelated and anonymous actors", async (_label, method, url, body) => {
      for (const actor of denied) await send(method, actor, url()).send(body()).expect(403);
      await send(method, null, url()).send(body()).expect(401);
    });
    it("owner and authorized editor can mutate care; a view-only member cannot escalate", async () => {
      await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "واکسن هاری", type: "VACCINATION", dueAt: future(72) }).expect(201);
      await send("post", "AUTHORIZED_MEMBER", `/pets/${petId}/care-items`).send({ title: "آرایش", type: "GROOMING", dueAt: future(72) }).expect(201);
      await send("post", "VIEW_ONLY_MEMBER", `/pets/${petId}/care-items`).send({ title: "x", type: "CUSTOM", dueAt: future(72) }).expect(403);
      await send("post", "VIEW_ONLY_MEMBER", `/pets/${petId}/care-items/${own.care}/actions`).send({ action: "COMPLETE" }).expect(403);
      await send("post", "VIEW_ONLY_MEMBER", `/pets/${petId}/observations`).send({ category: "APPETITE", description: "x", observedAt: new Date().toISOString() }).expect(403);
    });
    it("only an access manager can share with a vet; members cannot grant beyond their authority", async () => {
      const body = { providerUserId: providerId, scopes: ["ALLERGIES"], documentIds: [], startsAt: new Date().toISOString(), expiresAt: future(24) };
      await send("post", "AUTHORIZED_MEMBER", `/pets/${petId}/vet-shares`).send(body).expect(403);
      await send("post", "VIEW_ONLY_MEMBER", `/pets/${petId}/vet-shares`).send(body).expect(403);
      await send("post", "UNRELATED_HOUSEHOLD", `/pets/${petId}/vet-shares`).send(body).expect(403);
    });
  });

  describe("forged identifiers (IDOR)", () => {
    const detail: [string, string][] = [["condition", "health/conditions"], ["allergy", "health/allergies"], ["medication", "health/medications"], ["lab", "health/labs"], ["imaging", "health/imaging"], ["referral", "health/referrals"], ["dental", "health/dental"], ["nutrition", "health/nutrition"], ["rehab", "health/rehab"], ["observation", "observations"], ["document", "health/documents"], ["visit", "health/visits"], ["care", "care-items"]];
    it.each(detail)("a foreign %s id through the owner's own pet returns 404, and the owner's own id works", async (key, route) => {
      await get("OWNER", `/pets/${petId}/${route}/${foreign[key]}`).expect(404);
      await get("OWNER", `/pets/${petId}/${route}/${own[key]}`).expect(200);
    });
    it.each(detail)("a forged petId for %s is denied before lookup", async (key, route) => {
      await get("OWNER", `/pets/${otherPetId}/${route}/${foreign[key]}`).expect(403);
      await get("OWNER", `/pets/${randomUUID()}/${route}/${own[key]}`).expect((res) => expect([403, 404]).toContain(res.status));
    });
    it("vaccination summary is pet-scoped: a forged petId is denied", async () => {
      await get("OWNER", `/pets/${otherPetId}/health/vaccination-summary`).expect(403);
    });
    it("forged care item cannot be acted on or edited through another pet", async () => {
      await send("post", "OWNER", `/pets/${petId}/care-items/${foreign.care}/actions`).send({ action: "COMPLETE" }).expect(404);
      await send("patch", "OWNER", `/pets/${petId}/care-items/${foreign.care}`).send({ title: "hijack" }).expect(404);
      expect((await db.careReminder.findUniqueOrThrow({ where: { id: foreign.care } })).state).toBe("UPCOMING");
    });
    it("forged observation media download is denied", async () => {
      await get("OWNER", `/pets/${petId}/observations/${foreign.observation}/download`).expect(404);
    });
  });

  describe("document security", () => {
    it("detail and signed download are authorized per actor and never return a public object URL", async () => {
      for (const actor of ["OWNER", "AUTHORIZED_MEMBER", "VIEW_ONLY_MEMBER"]) await get(actor, `/pets/${petId}/health/documents/${own.document}`).expect(200);
      for (const actor of ["REVOKED_MEMBER", "EXPIRED_GRANT", "UNRELATED_HOUSEHOLD"]) {
        await get(actor, `/pets/${petId}/health/documents/${own.document}`).expect(403);
        await get(actor, `/pets/${petId}/health/documents/${own.document}/download`).expect(403);
      }
      await request(server()).get(`/pets/${petId}/health/documents/${own.document}/download`).expect(401);
      const signed = await get("OWNER", `/pets/${petId}/health/documents/${own.document}/download`).expect(200);
      expect(signed.body.expiresInSeconds).toBeGreaterThan(0);
      expect(signed.body.expiresInSeconds).toBeLessThanOrEqual(3600);
      expect(signed.body.downloadUrl).not.toContain("/uploads/");
      expect(signed.body.downloadUrl).not.toContain(`health-documents/${petId}`);
      const dto = await get("OWNER", `/pets/${petId}/health/documents/${own.document}`).expect(200);
      expect(JSON.stringify(dto.body)).not.toContain("fileObjectKey");
    });
    it("an invalid or tampered signed token is rejected", async () => {
      await request(server()).get(`/downloads/${randomUUID()}`).expect(404);
    });
    it("a voided document stays in the owner's audit history but cannot be newly shared with a vet", async () => {
      const id = (await db.medicalDocument.create({ data: { petId, householdId, documentType: "OTHER", title: "باطل", sourceType: "OWNER", fileObjectKey: `health-documents/${petId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12, voidedAt: new Date() } })).id;
      await get("OWNER", `/pets/${petId}/health/documents/${id}`).expect(200);
      await send("post", "OWNER", `/pets/${petId}/vet-shares`).send({ providerUserId: providerId, scopes: ["SELECTED_DOCUMENTS"], documentIds: [id], startsAt: new Date().toISOString(), expiresAt: future(24) }).expect(404);
    });
  });

  describe("share with vet lifecycle", () => {
    const base = () => `/pets/${petId}/vet-shares`;
    it("preview shows exactly the chosen scope, and the recipient reads only that scope and only selected documents", async () => {
      const input = { providerUserId: providerId, scopes: ["ALLERGIES", "SELECTED_DOCUMENTS"], documentIds: [own.document], startsAt: new Date(Date.now() - 1000).toISOString(), expiresAt: future(24) };
      const preview = await send("post", "OWNER", `${base()}/preview`).send(input).expect(201);
      expect(preview.body.allergies).toHaveLength(1);
      expect(preview.body.documents.map((d: { id: string }) => d.id)).toEqual([own.document]);
      expect(preview.body.conditions).toBeUndefined();
      expect(preview.body.medications).toBeUndefined();
      expect(preview.body.visits).toBeUndefined();
      const share = await send("post", "OWNER", base()).send(input).expect(201);
      const url = `/shared-pets/${petId}/vet-shares/${share.body.id}`;

      const inbox = await get("VET", "/vet-shares/received").expect(200);
      expect(inbox.body.map((s: { id: string }) => s.id)).toContain(share.body.id);
      expect(JSON.stringify(inbox.body)).not.toContain("مرغ");
      expect((await get("OTHER_VET", "/vet-shares/received").expect(200)).body).toHaveLength(0);

      const read = await get("VET", url).expect(200);
      expect(read.body.allergies).toHaveLength(1);
      expect(read.body.conditions).toBeUndefined();
      await get("VET", `${url}/documents/${own.document}/download`).expect(200);
      await get("VET", `${url}/documents/${own.document2}/download`).expect(403);
      await get("VET", `${url}/documents/${foreign.document}/download`).expect(403);
      await get("OTHER_VET", url).expect(403);
      await get("VET", `/shared-pets/${otherPetId}/vet-shares/${share.body.id}`).expect(403);
      // The share never widens into the regular health API.
      await get("VET", `/pets/${petId}/health/allergies`).expect(403);
      await get("VET", `/pets/${petId}/health/documents/${own.document}/download`).expect(403);

      await send("post", "OWNER", `${base()}/${share.body.id}/revoke`).send({}).expect(201);
      await get("VET", url).expect(403);
      await get("VET", `${url}/documents/${own.document}/download`).expect(403);
      expect((await get("VET", "/vet-shares/received").expect(200)).body.map((s: { id: string }) => s.id)).not.toContain(share.body.id);
      await send("post", "OWNER", `${base()}/${share.body.id}/revoke`).send({}).expect(404);
      expect(await db.domainEvent.count({ where: { type: "PetHealthShareRevoked", aggregateId: petId } })).toBe(1);
    });
    it("a share does not start before its start time and ends at expiry", async () => {
      const pending = await send("post", "OWNER", base()).send({ providerUserId: providerId, scopes: ["ALLERGIES"], documentIds: [], startsAt: future(2), expiresAt: future(24) }).expect(201);
      await get("VET", `/shared-pets/${petId}/vet-shares/${pending.body.id}`).expect(403);
      await db.petAccessGrant.update({ where: { id: pending.body.id }, data: { startsAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
      await get("VET", `/shared-pets/${petId}/vet-shares/${pending.body.id}`).expect(403);
    });
    it("rejects invalid periods, documents outside the pet and documents without the document scope", async () => {
      const ok = { providerUserId: providerId, scopes: ["ALLERGIES"], documentIds: [] as string[], startsAt: new Date().toISOString(), expiresAt: future(24) };
      await send("post", "OWNER", base()).send({ ...ok, expiresAt: future(24 * 91) }).expect(400);
      await send("post", "OWNER", base()).send({ ...ok, expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(400);
      await send("post", "OWNER", base()).send({ ...ok, scopes: ["SELECTED_DOCUMENTS"], documentIds: [foreign.document] }).expect(404);
      await send("post", "OWNER", base()).send({ ...ok, documentIds: [own.document] }).expect(400);
      await send("post", "OWNER", base()).send({ ...ok, providerUserId: randomUUID() }).expect(404);
    });
    it("a booking alone never grants medical access", async () => {
      await db.petAccessGrant.create({ data: { petId, userId: actors.OTHER_VET!.id, canViewHealth: true, canViewIdentity: true, source: "TEMPORARY", reason: "VET_BOOKING", expiresAt: future(24) as unknown as Date } });
      await get("OTHER_VET", `/pets/${petId}/health/conditions`).expect(403);
      await get("OTHER_VET", `/pets/${petId}/health/documents/${own.document}/download`).expect(403);
    });
  });

  describe("reminder engine", () => {
    it("notifies once when due soon and once more when overdue, each deep-linking to the exact care item", async () => {
      const worker = app.get(CareReminderWorker);
      const item = await db.careReminder.create({ data: { petId, createdByUserId: actors.OWNER!.id, title: "قرص قلب", type: "MEDICATION", dueAt: new Date(Date.now() + 6 * 3600000), originalDueAt: new Date(Date.now() + 6 * 3600000) } });
      await worker.process(); await worker.process();
      let rows = await db.notification.findMany({ where: { entityId: item.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.deepLink).toBe(`/pets/${petId}/care/${item.id}`);
      expect((rows[0]!.metadata as { phase?: string }).phase).toBe("DUE");
      await db.careReminder.update({ where: { id: item.id }, data: { dueAt: new Date(Date.now() - 60000), originalDueAt: new Date(Date.now() - 60000), notifiedAt: new Date(Date.now() - 6 * 3600000) } });
      await worker.process(); await worker.process();
      rows = await db.notification.findMany({ where: { entityId: item.id }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => (r.metadata as { phase?: string }).phase)).toEqual(["DUE", "OVERDUE"]);
      expect((await db.careReminder.findUniqueOrThrow({ where: { id: item.id } })).state).toBe("UPCOMING");
    });
    it("does not notify during a snooze and never for closed care", async () => {
      const worker = app.get(CareReminderWorker);
      const due = new Date(Date.now() - 60000);
      const snoozed = await db.careReminder.create({ data: { petId, createdByUserId: actors.OWNER!.id, title: "پیگیری", type: "FOLLOW_UP", dueAt: due, originalDueAt: due, snoozedUntil: new Date(Date.now() + 3600000) } });
      const done = await db.careReminder.create({ data: { petId, createdByUserId: actors.OWNER!.id, title: "انجام‌شده", type: "CUSTOM", dueAt: due, originalDueAt: due, state: "COMPLETED", completedAt: new Date() } });
      await worker.process();
      expect(await db.notification.count({ where: { entityId: { in: [snoozed.id, done.id] } } })).toBe(0);
    });
    it("does not notify a creator whose access was revoked", async () => {
      const worker = app.get(CareReminderWorker);
      const due = new Date(Date.now() - 60000);
      const item = await db.careReminder.create({ data: { petId, createdByUserId: actors.REVOKED_MEMBER!.id, title: "x", type: "CUSTOM", dueAt: due, originalDueAt: due } });
      await worker.process();
      expect(await db.notification.count({ where: { entityId: item.id } })).toBe(0);
    });
    it("projects a recorded vaccination due date idempotently, and a changed source date replaces the open projection", async () => {
      const listener = app.get(CareSourceListener);
      const day = (days: number) => { const d = new Date(Date.now() + days * 86400000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
      const first = day(20);
      await db.vaccinationSummary.upsert({ where: { petId }, create: { petId, status: "UP_TO_DATE", nextDueDate: first }, update: { nextDueDate: first } });
      await listener.syncPet(petId); await listener.syncPet(petId);
      let rows = await db.careReminder.findMany({ where: { petId, source: "MEDICAL_RECORD_DERIVED" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.originalDueAt.toISOString()).toBe(first.toISOString());
      expect(rows[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);

      // Derived care cannot be edited, but its reminder time can be rescheduled without touching source truth.
      await send("patch", "OWNER", `/pets/${petId}/care-items/${rows[0]!.id}`).send({ title: "x" }).expect(400);
      await send("post", "OWNER", `/pets/${petId}/care-items/${rows[0]!.id}/actions`).send({ action: "RESCHEDULE", at: future(24 * 21) }).expect(201);
      const moved = await db.careReminder.findUniqueOrThrow({ where: { id: rows[0]!.id } });
      expect(moved.originalDueAt.toISOString()).toBe(first.toISOString());
      expect((await db.vaccinationSummary.findUniqueOrThrow({ where: { petId } })).nextDueDate?.toISOString()).toBe(first.toISOString());
      await listener.syncPet(petId);
      expect(await db.careReminder.count({ where: { petId, source: "MEDICAL_RECORD_DERIVED", state: { notIn: ["CANCELLED"] } } })).toBe(1);

      const second = day(40);
      await db.vaccinationSummary.update({ where: { petId }, data: { nextDueDate: second } });
      await listener.syncPet(petId);
      rows = await db.careReminder.findMany({ where: { petId, source: "MEDICAL_RECORD_DERIVED" }, orderBy: { originalDueAt: "asc" } });
      expect(rows.map((r) => r.state)).toEqual(["CANCELLED", "UPCOMING"]);
      expect(rows[1]!.originalDueAt.toISOString()).toBe(second.toISOString());
    });
    it("cancel and complete are terminal, preserved and never create clinical records", async () => {
      const created = await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "لغو شود", type: "GROOMING", dueAt: future(10) }).expect(201);
      await send("post", "OWNER", `/pets/${petId}/care-items/${created.body.id}/actions`).send({ action: "CANCEL" }).expect(201);
      await send("post", "OWNER", `/pets/${petId}/care-items/${created.body.id}/actions`).send({ action: "SNOOZE", at: future(2) }).expect(400);
      const visits = await db.clinicalVisit.count({ where: { petId } });
      const docs = await db.medicalDocument.count({ where: { petId } });
      const toComplete = await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "واکسن", type: "VACCINATION", dueAt: future(10) }).expect(201);
      await send("post", "OWNER", `/pets/${petId}/care-items/${toComplete.body.id}/actions`).send({ action: "COMPLETE" }).expect(201);
      expect(await db.clinicalVisit.count({ where: { petId } })).toBe(visits);
      expect(await db.medicalDocument.count({ where: { petId } })).toBe(docs);
      const list = await get("OWNER", `/pets/${petId}/care-items`).expect(200);
      const states = Object.fromEntries(list.body.map((r: { id: string; state: string }) => [r.id, r.state]));
      expect(states[created.body.id]).toBe("CANCELLED");
      expect(states[toComplete.body.id]).toBe("COMPLETED");
    });
    it("rejects timestamps without a timezone and snoozes in the past", async () => {
      await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "x", type: "CUSTOM", dueAt: "2026-10-01T10:00:00" }).expect(400);
      await send("post", "OWNER", `/pets/${petId}/care-items/${own.care}/actions`).send({ action: "SNOOZE", at: new Date(Date.now() - 1000).toISOString() }).expect(400);
      await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "x", type: "CUSTOM", dueAt: future(5), recurrence: "CUSTOM" }).expect(400);
      await send("post", "OWNER", `/pets/${petId}/care-items`).send({ title: "x", type: "NOT_A_TYPE", dueAt: future(5) }).expect(400);
    });
  });

  describe("entitlement downgrade", () => {
    it("allows creation while entitled, blocks new premium creation after loss, and keeps history readable", async () => {
      await send("post", "OWNER", `/pets/${petId}/observations`).send({ category: "BEHAVIOR", description: "بازیگوش", observedAt: new Date().toISOString() }).expect(201);
      const admin = await db.user.create({ data: { email: `b2m-admin-${randomUUID()}@example.com`, displayName: "admin" } });
      const superAdmin = await db.adminUser.create({ data: { userId: admin.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
      for (const key of ["health.observations.max", "health.documents.max"]) {
        await db.subscriptionEntitlementOverride.create({ data: { householdId, key, type: "LIMIT", limitValue: 0, reason: "Batch 2 downgrade regression", createdByAdminId: superAdmin.id } });
      }
      const blocked = await send("post", "OWNER", `/pets/${petId}/observations`).send({ category: "BEHAVIOR", description: "x", observedAt: new Date().toISOString() }).expect(409);
      expect(blocked.body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
      const upload = await send("post", "OWNER", `/pets/${petId}/health/documents/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201);
      await send("post", "OWNER", `/pets/${petId}/health/documents`).send({ key: upload.body.key, documentType: "OTHER", title: "x", mimeType: "application/pdf", fileSizeBytes: 100 }).expect(409);

      await get("OWNER", `/pets/${petId}/health/conditions/${own.condition}`).expect(200);
      await get("OWNER", `/pets/${petId}/observations/${own.observation}`).expect(200);
      await get("OWNER", `/pets/${petId}/health/documents/${own.document}`).expect(200);
      await get("OWNER", `/pets/${petId}/health/documents/${own.document}/download`).expect(200);
      await get("OWNER", `/pets/${petId}/health/timeline`).expect(200);
      const care = await get("OWNER", `/pets/${petId}/care-items`).expect(200);
      expect(care.body.some((r: { state: string }) => r.state === "COMPLETED")).toBe(true);
    });
  });
});
