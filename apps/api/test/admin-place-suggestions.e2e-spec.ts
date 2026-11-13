import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Owner #6 (2026-11-13): the admin place-suggestions tab — queue, duplicate hints, photos, approve, reject with a reason. */
describe("admin place suggestions", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `aps-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("shows duplicates and photos, approves once (staff pin allowed), rejects only with a reason, and tells the member", async () => {
    const city = `Sagabad-${randomUUID().slice(0, 6)}`;
    // A random spot no other suite uses (south-east Iran), so other suites' places never count as "nearby" here
    // and the places this test creates never show up in theirs.
    const lat = 27.2 + Math.random() * 0.6, lng = 60.4 + Math.random() * 0.6;
    const ops = await actor("Places Ops", AdminRole.ADMIN);
    const viewer = await actor("Read Only", AdminRole.READ_ONLY);
    const member = await actor("Mina Member");
    const other = await actor("Omid Member");

    // An existing place 40 m from the pin, and one with the same name spelled with Arabic letters and a ZWNJ.
    const near = await db.petFriendlyPlace.create({ data: { name: "Green Corner", category: "PARK", city, country: "IR", latitude: lat + 0.0001, longitude: lng + 0.0001 } });
    await db.$executeRaw`UPDATE "pet_friendly_places" SET "location" = ST_SetSRID(ST_MakePoint(${lng + 0.0001}::float8, ${lat + 0.0001}::float8), 4326)::geography WHERE id = ${near.id}::uuid`;
    const twinName = await db.petFriendlyPlace.create({ data: { name: "كافه سگ‌ها", category: "CAFE", city, country: "IR", latitude: lat + 0.1, longitude: lng + 0.1 } });

    // Photos: a private upload slot under the member's own prefix, no public URL; someone else's key is refused.
    const slot = (await post(member, "/place-suggestions/photo-upload-url").send({ contentType: "image/webp", fileSizeBytes: 2048 }).expect(201)).body;
    expect(slot.key).toMatch(new RegExp(`^place-suggestions/${member.id}/[0-9a-f-]{36}\\.webp$`));
    expect(slot.publicUrl).toBeUndefined();
    await post(member, "/place-suggestions/photo-upload-url").send({ contentType: "image/svg+xml", fileSizeBytes: 2048 }).expect(400);
    const otherSlot = (await post(other, "/place-suggestions/photo-upload-url").send({ contentType: "image/png", fileSizeBytes: 10 }).expect(201)).body;
    await post(member, "/place-suggestions").send({ name: "x", category: "PARK", city, photoObjectKeys: [otherSlot.key] }).expect(400);

    const cafe = (await post(member, "/place-suggestions").send({ name: "کافه سگها", category: "CAFE", city, photoObjectKeys: [slot.key] }).expect(201)).body;
    expect(cafe).toMatchObject({ photoCount: 1 });
    expect(JSON.stringify(cafe)).not.toContain(slot.key);
    const park = (await post(member, "/place-suggestions").send({ name: "Green corner park", category: "PARK", city, latitude: lat + 0.0004, longitude: lng + 0.0003 }).expect(201)).body;
    const twin = (await post(other, "/place-suggestions").send({ name: "Green Corner Park", category: "PARK", city, latitude: lat + 0.0005, longitude: lng + 0.0004 }).expect(201)).body;

    await get(member, "/admin/place-suggestions/queue").expect(403);
    const queue = (await get(viewer, "/admin/place-suggestions/queue?status=PENDING&kind=NEW_PLACE").expect(200)).body;
    expect(queue.counts.PENDING).toBeGreaterThanOrEqual(3);
    const row = (id: string) => queue.items.find((i: { id: string }) => i.id === id);
    expect(row(park.id)).toMatchObject({ member: { displayName: "Mina Member" }, similarPendingIds: [twin.id] });
    expect(row(park.id).duplicates).toEqual([expect.objectContaining({ placeId: near.id, name: "Green Corner", sameName: false })]);
    expect(row(park.id).duplicates[0].distanceMeters).toBeLessThan(250);
    expect(row(cafe.id).duplicates).toEqual([expect.objectContaining({ placeId: twinName.id, sameName: true, distanceMeters: null })]);
    expect(row(cafe.id).photos).toEqual([expect.objectContaining({ index: 0, url: expect.any(String) })]);
    expect(JSON.stringify(row(cafe.id))).not.toContain(slot.key);
    expect((await get(viewer, "/admin/dashboard").expect(200)).body.pendingPlaceSuggestions).toBeGreaterThanOrEqual(3);

    // Acting needs places.manage; a rejection needs a reason; a new place needs a pin (the member's or staff's).
    await post(viewer, `/admin/place-suggestions/${twin.id}/reject`).send({ note: "Duplicate of another suggestion" }).expect(403);
    await post(ops, `/admin/place-suggestions/${twin.id}/reject`).send({}).expect(400);
    await post(ops, `/admin/place-suggestions/${twin.id}/reject`).send({ note: "no" }).expect(400);
    await post(ops, `/admin/place-suggestions/${twin.id}/reject`).send({ note: "Same place as another suggestion" }).expect(201);
    await post(ops, `/admin/place-suggestions/${cafe.id}/approve`).send({}).expect(400);
    await post(ops, `/admin/place-suggestions/${cafe.id}/approve`).send({ latitude: lat + 0.11 }).expect(400);
    const approved = (await post(ops, `/admin/place-suggestions/${cafe.id}/approve`).send({ latitude: lat + 0.11, longitude: lng + 0.11, note: "Pin from the address" }).expect(201)).body;
    expect(approved.status).toBe("APPROVED");
    const created = await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: approved.createdPlaceId } });
    expect(created).toMatchObject({ status: "UNVERIFIED", isPubliclyListed: false });
    expect(created.latitude).toBeCloseTo(lat + 0.11, 6);
    expect(created.longitude).toBeCloseTo(lng + 0.11, 6);
    await post(ops, `/admin/place-suggestions/${cafe.id}/approve`).send({ note: "again" }).expect(400);
    await post(ops, `/admin/place-suggestions/${park.id}/approve`).send({}).expect(201);

    const decided = (await get(viewer, "/admin/place-suggestions/queue?status=REJECTED").expect(200)).body;
    expect(decided.items.find((i: { id: string }) => i.id === twin.id)).toMatchObject({ reviewNote: "Same place as another suggestion", reviewedBy: "Places Ops", duplicates: [] });

    const notes = await db.notification.findMany({ where: { userId: { in: [member.id, other.id] }, type: { startsWith: "place_suggestion." } }, select: { userId: true, type: true, body: true } });
    expect(notes.filter((n) => n.userId === member.id).map((n) => n.type)).toEqual(["place_suggestion.approved", "place_suggestion.approved"]);
    expect(notes.filter((n) => n.userId === other.id)).toEqual([expect.objectContaining({ type: "place_suggestion.rejected", body: expect.stringContaining("Same place as another suggestion") })]);
    expect(await db.adminAuditLog.findFirst({ where: { action: "place_suggestion.approved", entityId: cafe.id } })).toMatchObject({ reason: "Pin from the address", afterSummary: expect.objectContaining({ pinFrom: "STAFF", memberPhotos: 1 }) });
    expect(await db.adminAuditLog.count({ where: { action: "place_suggestion.rejected", entityId: twin.id, reason: "Same place as another suggestion" } })).toBe(1);
  });
});
