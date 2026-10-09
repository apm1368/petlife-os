import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { ProviderUserRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { grantPlanFeatures } from "./plan-features";

type Actor = { id: string; cookie: string; csrf: string };
const DAY = 86400e3;

/** G12: health snapshot, canonical feed (filters, provenance, cursor), health shares (expiry, revoke, access log), care suggestions (chain #1), care history filters. */
describe("Health and care depth", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g12-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function setup() {
    const o = await actor("owner");
    const hh = (await post(o, "/households").send({}).expect(201)).body;
    const pet = (await post(o, `/households/${hh.id}/pets`).send({ name: "Health Dog", species: "DOG", approximateAgeMonths: 40 }).expect(201)).body;
    const org = await db.providerOrganization.create({ data: { name: `G12 Clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const vetActor = await actor("vet");
    const vet = await db.providerUser.create({ data: { userId: vetActor.id, providerOrganizationId: org.id, role: ProviderUserRole.VET } });
    const petId = pet.id as string;
    await db.allergy.create({ data: { petId, name: "Chicken", severity: "MODERATE", sourceType: "OWNER" } });
    await db.medication.create({ data: { petId, name: "Apoquel", status: "ACTIVE", sourceType: "PROVIDER", startDate: new Date(Date.now() - 10 * DAY) } });
    await db.condition.create({ data: { petId, name: "Atopic dermatitis", status: "ACTIVE", sourceType: "OWNER" } });
    const lab = await db.labResult.create({ data: { petId, testName: "ALP", value: "171", flag: "ABNORMAL", status: "FINAL", resultDate: new Date(Date.now() - 2 * DAY), providerOrganizationId: org.id, recordedByProviderUserId: vet.id, sourceType: "PROVIDER" } });
    const lab2 = await db.labResult.create({ data: { petId, testName: "HGB", value: "15", status: "FINAL", resultDate: new Date(Date.now() - 3 * DAY), sourceType: "OWNER" } });
    const visit = await db.clinicalVisit.create({ data: { petId, householdId: hh.id, providerOrganizationId: org.id, providerUserId: vet.id, status: "COMPLETED", startedAt: new Date(Date.now() - DAY), completedAt: new Date(Date.now() - DAY), reasonForVisit: "Itchy skin" } });
    await db.patientVitalsRecord.create({ data: { petId, providerOrganizationId: org.id, providerUserId: vet.id, recordedAt: new Date(Date.now() - DAY), weightValue: 27.4, weightUnit: "KG", sourceType: "PROVIDER" } });
    return { o, householdId: hh.id as string, petId, org, vetActor, vet, lab, lab2, visit };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("snapshot is deterministic and never interprets: a lab is abnormal only by its stored flag", async () => {
    const s = await setup();
    const snap = (await get(s.o, `/pets/${s.petId}/health/snapshot`).expect(200)).body;
    expect(snap.activeConditions.map((c: { name: string }) => c.name)).toEqual(["Atopic dermatitis"]);
    expect(snap.activeMedications.map((m: { name: string }) => m.name)).toEqual(["Apoquel"]);
    expect(snap.allergies.map((a: { name: string }) => a.name)).toEqual(["Chicken"]);
    expect(snap.latestWeight).toMatchObject({ value: 27.4, unit: "KG", source: "CLINIC" });
    expect(snap.recentLabs.map((l: { testName: string; flag: string | null }) => [l.testName, l.flag])).toEqual([["ALP", "ABNORMAL"], ["HGB", null]]);
    expect(snap.recentVisits[0]).toMatchObject({ id: s.visit.id, reason: "Itchy skin" });
    expect(snap.documentsCount).toBe(0);
    await get(await actor("stranger"), `/pets/${s.petId}/health/snapshot`).expect(403);
  });

  it("feed: one canonical list with weight, normalised provenance, filters and a stable cursor", async () => {
    const s = await setup();
    const all = (await get(s.o, `/pets/${s.petId}/health/feed?limit=100`).expect(200)).body.items;
    const types = all.map((i: { type: string }) => i.type);
    expect(types).toEqual(expect.arrayContaining(["WEIGHT", "LAB", "VISIT", "ALLERGY", "CONDITION", "MEDICATION"]));
    const alp = all.find((i: { recordId: string }) => i.recordId === s.lab.id);
    expect(alp).toMatchObject({ type: "LAB", source: "VET", organization: { id: s.org.id }, deepLink: `/pets/${s.petId}/health/labs/${s.lab.id}` });
    expect(alp.recordedAt).toBeTruthy();
    expect(all.find((i: { recordId: string }) => i.recordId === s.lab2.id).source).toBe("OWNER");
    const labs = (await get(s.o, `/pets/${s.petId}/health/feed?types=LAB`).expect(200)).body.items;
    expect(labs.every((i: { type: string }) => i.type === "LAB")).toBe(true);
    expect((await get(s.o, `/pets/${s.petId}/health/feed?sources=OWNER`).expect(200)).body.items.every((i: { source: string }) => i.source === "OWNER")).toBe(true);
    await get(s.o, `/pets/${s.petId}/health/feed?types=SECRET`).expect(400);
    // Cursor pages cover everything exactly once.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: { id: string }[]; nextCursor: string | null } = (await get(s.o, `/pets/${s.petId}/health/feed?limit=2${cursor ? `&cursor=${cursor}` : ""}`).expect(200)).body;
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.map((i: { id: string }) => i.id));
  });

  it("health share: owner-selected, short-lived, revocable, logged; never another pet's records", async () => {
    const s = await setup();
    const other = await setup();
    await post(s.o, `/pets/${s.petId}/health-shares`).send({ sections: ["ALLERGIES"], labResultIds: [other.lab.id] }).expect(400);
    await post(s.o, `/pets/${s.petId}/health-shares`).send({ sections: [] }).expect(400);
    await post(s.o, `/pets/${s.petId}/health-shares`).send({ sections: ["ALLERGIES"], expiresInHours: 200 }).expect(400);
    const share = (await post(s.o, `/pets/${s.petId}/health-shares`).send({ sections: ["ALLERGIES", "MEDICATIONS"], labResultIds: [s.lab.id], expiresInHours: 12, label: "For the ER" }).expect(201)).body;
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const read = (await request(server()).get(`/public/health-shares/${share.token}`).set("User-Agent", "ER desk").expect(200)).body;
    expect(read.allergies.map((a: { name: string }) => a.name)).toEqual(["Chicken"]);
    expect(read.activeMedications.map((m: { name: string }) => m.name)).toEqual(["Apoquel"]);
    expect(read.activeConditions).toBeUndefined();
    expect(read.labs.map((l: { testName: string; flag: string }) => [l.testName, l.flag])).toEqual([["ALP", "ABNORMAL"]]);
    expect(JSON.stringify(read)).not.toContain(s.petId);
    const listed = (await get(s.o, `/pets/${s.petId}/health-shares`).expect(200)).body;
    expect(listed[0]).toMatchObject({ state: "ACTIVE", accessCount: 1, label: "For the ER" });
    expect(JSON.stringify(listed)).not.toContain(share.token);
    expect((await get(s.o, `/pets/${s.petId}/health-shares/${share.id}/access-log`).expect(200)).body[0].userAgent).toBe("ER desk");
    await get(other.o, `/pets/${s.petId}/health-shares`).expect(403);
    await post(other.o, `/pets/${s.petId}/health-shares/${share.id}/revoke`).expect(403);
    await post(s.o, `/pets/${s.petId}/health-shares/${share.id}/revoke`).expect(201);
    await request(server()).get(`/public/health-shares/${share.token}`).expect(404);
    const expiring = (await post(s.o, `/pets/${s.petId}/health-shares`).send({ sections: ["ALLERGIES"] }).expect(201)).body;
    await db.healthShareLink.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(server()).get(`/public/health-shares/${expiring.token}`).expect(404);
  });

  it("chain #1: a clinic suggests care on a completed visit → owner notified → accept creates one reminder (entitlement-gated, race-safe) → activity", async () => {
    const s = await setup();
    const otherClinic = await setup();
    const item = { title: "Recheck ALP", type: "LAB_TEST", suggestedDueAt: new Date(Date.now() + 60 * DAY).toISOString(), notes: "Fasting sample" };
    await post(otherClinic.vetActor, `/provider/clinical/visits/${s.visit.id}/care-suggestions`).send({ items: [item] }).expect(404);
    const openVisit = await db.clinicalVisit.create({ data: { petId: s.petId, householdId: s.householdId, providerOrganizationId: s.org.id, providerUserId: s.vet.id, status: "IN_PROGRESS", startedAt: new Date() } });
    await post(s.vetActor, `/provider/clinical/visits/${openVisit.id}/care-suggestions`).send({ items: [item] }).expect(400);
    const created = (await post(s.vetActor, `/provider/clinical/visits/${s.visit.id}/care-suggestions`).send({ items: [item, { title: "Weight check", type: "WEIGHT_CHECK", suggestedDueAt: new Date(Date.now() + 30 * DAY).toISOString() }] }).expect(201)).body;
    expect(created).toHaveLength(2);
    expect(await db.notification.count({ where: { userId: s.o.id, type: "care.suggestion_received" } })).toBe(1);
    expect(await db.careReminder.count({ where: { petId: s.petId } })).toBe(0);

    const pending = (await get(s.o, `/pets/${s.petId}/care-suggestions?status=PENDING`).expect(200)).body;
    expect(pending.map((p: { title: string }) => p.title).sort()).toEqual(["Recheck ALP", "Weight check"]);
    expect(pending[0].organization).toMatchObject({ id: s.org.id });
    const recheck = pending.find((p: { title: string }) => p.title === "Recheck ALP");

    // Free plan: personal reminders are a paid feature — accept is refused and the suggestion stays pending.
    expect((await post(s.o, `/pets/${s.petId}/care-suggestions/${recheck.id}/accept`).send({}).expect(409)).body.error.details.key).toBe("care.reminders");
    expect((await db.careSuggestion.findUniqueOrThrow({ where: { id: recheck.id } })).status).toBe("PENDING");

    await grantPlanFeatures(db, s.householdId, ["care.reminders"]);
    const [a, b] = await Promise.all([post(s.o, `/pets/${s.petId}/care-suggestions/${recheck.id}/accept`).send({}), post(s.o, `/pets/${s.petId}/care-suggestions/${recheck.id}/accept`).send({})]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await db.careReminder.count({ where: { petId: s.petId, title: "Recheck ALP" } })).toBe(1);
    const weight = pending.find((p: { title: string }) => p.title === "Weight check");
    expect((await post(s.o, `/pets/${s.petId}/care-suggestions/${weight.id}/dismiss`).expect(201)).body.status).toBe("DISMISSED");
    await post(s.o, `/pets/${s.petId}/care-suggestions/${weight.id}/accept`).send({}).expect(400);
    await post(otherClinic.o, `/pets/${s.petId}/care-suggestions/${weight.id}/dismiss`).expect(403);

    const kinds = (await get(s.o, `/households/${s.householdId}/activity`).expect(200)).body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["CARE_SUGGESTED", "CARE_SUGGESTION_ACCEPTED"]));
  });

  it("care history filters by state, type and due-date range; double completion is refused", async () => {
    const s = await setup();
    await grantPlanFeatures(db, s.householdId, ["care.reminders"]);
    const mk = async (title: string, type: string, daysAgo: number) => (await post(s.o, `/pets/${s.petId}/care-items`).send({ title, type, dueAt: new Date(Date.now() + 3600e3 - daysAgo * DAY).toISOString() }).expect(201)).body;
    const a = await mk("Groom", "GROOMING", 0);
    const b = await mk("Weigh", "WEIGHT_CHECK", 0);
    const [c1, c2] = await Promise.all([post(s.o, `/pets/${s.petId}/care-items/${a.id}/actions`).send({ action: "COMPLETE" }), post(s.o, `/pets/${s.petId}/care-items/${a.id}/actions`).send({ action: "COMPLETE" })]);
    expect([c1.status, c2.status].sort()).toEqual([201, 400]);
    await post(s.o, `/pets/${s.petId}/care-items/${b.id}/actions`).send({ action: "SKIP" }).expect(201);
    const h = (q: string) => get(s.o, `/pets/${s.petId}/care-items/history${q}`).expect(200).then((r) => r.body.items.map((i: { title: string; state: string }) => `${i.title}:${i.state}`));
    expect(await h("?state=COMPLETED")).toEqual(["Groom:COMPLETED"]);
    expect(await h("?type=WEIGHT_CHECK")).toEqual(["Weigh:SKIPPED"]);
    expect(await h(`?from=${new Date(Date.now() + 10 * DAY).toISOString()}`)).toEqual([]);
    await get(s.o, `/pets/${s.petId}/care-items/history?state=UPCOMING`).expect(400);
  });
});
