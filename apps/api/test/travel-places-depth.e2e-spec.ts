import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { grantPlanFeatures } from "./plan-features";

type Actor = { id: string; cookie: string; csrf: string };
const DAY = 86400e3;

/** G15: checklist states, trip document links, trip preparation (chain #4), place corrections and closures. */
describe("Travel and places depth", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g15-${randomUUID()}@example.com`, locale: "en" } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true };
  async function household() {
    const owner = await actor("owner");
    const hh = await db.household.create({ data: { name: "hh", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Traveller", species: "DOG", approximateAgeMonths: 30, microchipNumber: "985112000000555" } });
    const second = await db.pet.create({ data: { householdId: hh.id, name: "Second", species: "CAT", approximateAgeMonths: 20 } });
    for (const p of [pet, second]) await db.petAccessGrant.create({ data: { petId: p.id, userId: owner.id, ...FULL } });
    return { owner, householdId: hh.id, petId: pet.id, secondPetId: second.id };
  }
  async function trip(h: Awaited<ReturnType<typeof household>>) {
    return (await send("post", h.owner, `/pets/${h.petId}/trips`).send({ originCountry: "IR", destinationCountry: "IR", destinationCity: "Ramsar", departAt: new Date(Date.now() + 20 * DAY).toISOString(), returnAt: new Date(Date.now() + 25 * DAY).toISOString() }).expect(201)).body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("checklist: TODO / DONE / NOT_REQUIRED, with `done` kept for older clients", async () => {
    const h = await household();
    const t = await trip(h);
    const base = `/pets/${h.petId}/trips/${t.id}`;
    const list = (await send("post", h.owner, `${base}/checklist/defaults`).expect(201)).body;
    const [a, b] = list.items;
    expect(a).toMatchObject({ state: "TODO", done: false });
    await send("patch", h.owner, `${base}/checklist/${a.id}`).send({ state: "NOT_REQUIRED" }).expect(200);
    const after = (await send("patch", h.owner, `${base}/checklist/${b.id}`).send({ done: true }).expect(200)).body;
    expect(after).toMatchObject({ done: 1, notRequired: 1, todo: list.total - 2 });
    expect(after.items.find((i: { id: string }) => i.id === b.id)).toMatchObject({ state: "DONE", done: true });
    await send("patch", h.owner, `${base}/checklist/${a.id}`).send({ state: "MAYBE" }).expect(400);
  });

  it("trip documents: references to the trip pets' existing documents only, gated by health access", async () => {
    const h = await household();
    const other = await household();
    const t = await trip(h);
    const base = `/pets/${h.petId}/trips/${t.id}`;
    const mkDoc = (petId: string, householdId: string, title: string) => db.medicalDocument.create({ data: { petId, householdId, title, documentType: "TRAVEL_DOCUMENT", sourceType: "OWNER", fileObjectKey: `health-documents/${petId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 100 } });
    const mine = await mkDoc(h.petId, h.householdId, "Health certificate");
    const secondDoc = await mkDoc(h.secondPetId, h.householdId, "Cat passport");
    const foreign = await mkDoc(other.petId, other.householdId, "Not yours");
    await send("post", h.owner, `${base}/documents`).send({ documentId: foreign.id }).expect(404);
    await send("post", h.owner, `${base}/documents`).send({ documentId: secondDoc.id }).expect(404); // not on the trip yet
    await send("post", h.owner, `${base}/participants`).send({ petId: h.secondPetId }).expect(201);
    await send("post", h.owner, `${base}/documents`).send({ documentId: secondDoc.id }).expect(201);
    const linked = (await send("post", h.owner, `${base}/documents`).send({ documentId: mine.id }).expect(201)).body;
    expect(linked.map((d: { title: string }) => d.title).sort()).toEqual(["Cat passport", "Health certificate"]);
    expect(await db.medicalDocument.count({ where: { title: "Health certificate" } })).toBeGreaterThanOrEqual(1);
    // A household member without health access sees no documents.
    const viewer = await actor("viewer");
    await db.householdMember.create({ data: { householdId: h.householdId, userId: viewer.id, role: "FAMILY" } });
    await db.petAccessGrant.create({ data: { petId: h.petId, userId: viewer.id, canViewIdentity: true } });
    await get(viewer, `${base}/documents`).expect(403);
    await get(other.owner, `${base}/documents`).expect(403);
    expect((await send("delete", h.owner, `${base}/documents/${mine.id}`).expect(200)).body.map((d: { title: string }) => d.title)).toEqual(["Cat passport"]);
  });

  it("chain #4: preparation joins readiness (advisory), checklist, documents and insurance; reminders only on confirmation, never twice", async () => {
    const h = await household();
    const t = await trip(h);
    const base = `/pets/${h.petId}/trips/${t.id}`;
    await db.medication.create({ data: { petId: h.petId, name: "Apoquel", status: "ACTIVE", sourceType: "OWNER" } });
    await send("post", h.owner, `${base}/checklist/defaults`).expect(201);
    const prep = (await get(h.owner, `${base}/preparation`).expect(200)).body;
    expect(prep.readiness.authority).toBe("ADVISORY");
    const status = Object.fromEntries(prep.readiness.items.map((i: { key: string; status: string }) => [i.key, i.status]));
    expect(status).toMatchObject({ MICROCHIP: "MET", HEALTH_CERTIFICATE: "NOT_MET", INSURANCE: "NOT_MET", MEDICATION: "NOT_MET", CARRIER: "NOT_MET" });
    expect(prep.insurance).toMatchObject({ insured: false, applications: [] });
    expect(prep.reminderProposals.map((p: { key: string }) => p.key)).toEqual(["VACCINATION_CHECK", "HEALTH_CERTIFICATE", "MEDICATION_REFILL", "PACKING"]);
    expect(await db.careReminder.count({ where: { petId: h.petId } })).toBe(0); // nothing created by looking

    expect((await send("post", h.owner, `${base}/reminder-proposals/apply`).send({ keys: ["HEALTH_CERTIFICATE"] }).expect(409)).body.error.details.key).toBe("care.reminders");
    await grantPlanFeatures(db, h.householdId, ["care.reminders"]);
    const applied = (await send("post", h.owner, `${base}/reminder-proposals/apply`).send({ keys: ["HEALTH_CERTIFICATE", "MEDICATION_REFILL"] }).expect(201)).body;
    expect(applied.created.map((c: { title: string }) => c.title).sort()).toEqual(["Get a health certificate for the trip", "Refill medication for the trip"]);
    expect((await send("post", h.owner, `${base}/reminder-proposals/apply`).send({ keys: ["HEALTH_CERTIFICATE"] }).expect(201)).body).toMatchObject({ created: [], skipped: 1 });
    await send("post", h.owner, `${base}/reminder-proposals/apply`).send({ keys: ["SOMETHING"] }).expect(400);
    await get(await actor("stranger"), `${base}/preparation`).expect(403);
  });

  it("place corrections and closure reports: moderated, whitelisted fields only, audited", async () => {
    const member = await actor("member");
    const place = await db.petFriendlyPlace.create({ data: { name: `Park ${randomUUID().slice(0, 6)}`, category: "PARK", country: "IR", city: "Rasht", latitude: 37.3, longitude: 49.6, status: "VERIFIED", isPubliclyListed: true, fencedArea: false } });
    await send("post", member, "/place-suggestions/changes").send({ kind: "CORRECTION", placeId: place.id }).expect(400);
    await send("post", member, "/place-suggestions/changes").send({ kind: "CORRECTION", placeId: place.id, changes: { status: "VERIFIED" } }).expect(400);
    const correction = (await send("post", member, "/place-suggestions/changes").send({ kind: "CORRECTION", placeId: place.id, changes: { fencedArea: true, entryFeeIrr: 0 }, notes: "New fence" }).expect(201)).body;
    expect(correction).toMatchObject({ kind: "CORRECTION", placeId: place.id, status: "PENDING", proposedChanges: { fencedArea: true, entryFeeIrr: 0 } });
    const closure = (await send("post", member, "/place-suggestions/changes").send({ kind: "CLOSURE_REPORT", placeId: place.id, notes: "Closed for good" }).expect(201)).body;
    expect((await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: place.id } })).fencedArea).toBe(false); // nothing changes before moderation

    const adminUser = await actor("admin");
    await db.adminUser.create({ data: { userId: adminUser.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    await send("post", member, `/admin/place-suggestions/${correction.id}/approve`).send({}).expect(403);
    await send("post", adminUser, `/admin/place-suggestions/${correction.id}/approve`).send({}).expect(201);
    expect(await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: place.id } })).toMatchObject({ fencedArea: true, entryFeeIrr: 0, status: "VERIFIED", isPubliclyListed: true });
    await send("post", adminUser, `/admin/place-suggestions/${closure.id}/approve`).send({}).expect(201);
    expect((await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: place.id } })).isPubliclyListed).toBe(false);
    expect(await db.adminAuditLog.count({ where: { entityId: place.id, action: { in: ["place_correction.approved", "place_closure.approved"] } } })).toBe(2);
    await send("post", member, "/place-suggestions/changes").send({ kind: "CORRECTION", placeId: place.id, changes: { fencedArea: false } }).expect(404); // no longer public
  });
});
