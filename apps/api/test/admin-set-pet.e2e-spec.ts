import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** «ست پت» admin side (owner, 2026-11-13): queue, detail, quote, production/shipping/cancel, audited design downloads. */
describe("admin Set Pet requests", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `asp-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function setPetRequest(member: Actor) {
    const req = await db.setPetRequest.create({
      data: { userId: member.id, humanColour: "black", humanSizes: ["M", "XXL"], petSize: "S", petColour: "black", petNeckCm: 28.5, petChestCm: 44, petBackLengthCm: 35, petWeightKg: 6.2, notes: "Name on the back" },
    });
    await db.setPetRequestEvent.create({ data: { requestId: req.id, toStatus: "SUBMITTED", actor: "MEMBER", actorUserId: member.id } });
    const ready = await db.setPetDesignFile.create({ data: { userId: member.id, requestId: req.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.svg`, mimeType: "image/svg+xml", fileSizeBytes: 2048, originalFilename: "logo.svg", previewable: false, status: "READY", uploadedAt: new Date() } });
    const photo = await db.setPetDesignFile.create({ data: { userId: member.id, requestId: req.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 4096, previewable: true, status: "READY", uploadedAt: new Date() } });
    const pending = await db.setPetDesignFile.create({ data: { userId: member.id, requestId: req.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1, status: "PENDING_UPLOAD" } });
    const loose = await db.setPetDesignFile.create({ data: { userId: member.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1, status: "READY" } });
    await db.setPetPlacement.create({ data: { requestId: req.id, zone: "FRONT_CENTER", designFileId: ready.id } });
    await db.setPetPlacement.create({ data: { requestId: req.id, zone: "PET_BACK", designFileId: photo.id } });
    return { req, ready, photo, pending, loose };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("quotes, produces, ships and cancels requests with a timeline row, an audit row and a member notification each time", async () => {
    const ops = await actor("Shop Ops", AdminRole.COMMERCE_OPERATIONS);
    const viewer = await actor("Read Only", AdminRole.READ_ONLY);
    const member = await actor("Sara Member");
    const other = await actor("Ali Member");
    const { req, ready, photo, pending, loose } = await setPetRequest(member);
    const second = (await setPetRequest(other)).req;
    const number = `SP-${String(req.number).padStart(6, "0")}`;

    await get(member, "/admin/set-pet/requests").expect(403);
    const listed = (await get(viewer, `/admin/set-pet/requests?status=SUBMITTED&q=${number}`).expect(200)).body;
    // The three files attached to the request (two ready, one still uploading); the member's loose upload isn't one.
    expect(listed.items).toEqual([expect.objectContaining({ id: req.id, number, memberName: "Sara Member", humanSizes: ["M", "XXL"], petSize: "S", placements: 2, designs: 3 })]);
    expect(listed.counts.SUBMITTED).toBe(1);
    expect((await get(viewer, `/admin/set-pet/requests?q=${encodeURIComponent("Ali Member")}`).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([second.id]);
    await get(viewer, "/admin/set-pet/requests?status=LOST").expect(400);
    expect((await get(viewer, "/admin/dashboard").expect(200)).body.newSetPetRequests).toBeGreaterThanOrEqual(2);

    const detail = (await get(viewer, `/admin/set-pet/requests/${req.id}`).expect(200)).body;
    expect(detail).toMatchObject({ number, status: "SUBMITTED", human: { colour: "black", sizes: ["M", "XXL"] }, petGarment: { size: "S", neckCm: 28.5, chestCm: 44, backLengthCm: 35, weightKg: 6.2 }, canQuote: true, allowedTransitions: ["CANCELLED"] });
    expect(detail.placements.map((p: { zone: string }) => p.zone).sort()).toEqual(["FRONT_CENTER", "PET_BACK"]);
    expect(JSON.stringify(detail)).not.toContain("objectKey");
    await get(viewer, `/admin/set-pet/requests/${randomUUID()}`).expect(404);

    // Acting needs commerce.manage.
    const readyBy = new Date(Date.now() + 6 * 86400e3).toISOString();
    await send("post", viewer, `/admin/set-pet/requests/${req.id}/quote`).send({ amountIrr: 25_000_000, estimatedReadyAt: readyBy, note: "Two shirts and a pet tee" }).expect(403);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/quote`).send({ amountIrr: 0, estimatedReadyAt: readyBy, note: "zero" }).expect(400);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "IN_PRODUCTION" }).expect(400);
    const quoted = (await send("post", ops, `/admin/set-pet/requests/${req.id}/quote`).send({ amountIrr: 25_000_000, estimatedReadyAt: readyBy, note: "Two shirts and a pet tee" }).expect(201)).body;
    expect(quoted).toMatchObject({ status: "QUOTED", quote: { amountIrr: 25_000_000, note: "Two shirts and a pet tee", quotedBy: "Shop Ops" }, canQuote: true });
    // A revised quote stays QUOTED and tells the member the price changed.
    await send("post", ops, `/admin/set-pet/requests/${req.id}/quote`).send({ amountIrr: 23_000_000, estimatedReadyAt: readyBy, note: "Discount for the set" }).expect(201);
    // Confirming is the member's step, never staff's.
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "CONFIRMED" }).expect(400);

    // The member accepts (X2's member endpoint will do this; the row change is the same).
    await db.setPetRequest.update({ where: { id: req.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await db.setPetRequestEvent.create({ data: { requestId: req.id, fromStatus: "QUOTED", toStatus: "CONFIRMED", actor: "MEMBER", actorUserId: member.id } });
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "SHIPPED" }).expect(400);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "IN_PRODUCTION", note: "Sent to the printer" }).expect(201);
    const shipped = (await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "SHIPPED", shippingNote: "Post, tracking 123456" }).expect(201)).body;
    expect(shipped).toMatchObject({ status: "SHIPPED", shippingNote: "Post, tracking 123456", allowedTransitions: [], canQuote: false });
    expect(shipped.timeline.map((e: { to: string; actor: string }) => `${e.actor}:${e.to}`)).toEqual(["MEMBER:SUBMITTED", "STAFF:QUOTED", "STAFF:QUOTED", "MEMBER:CONFIRMED", "STAFF:IN_PRODUCTION", "STAFF:SHIPPED"]);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "CANCELLED", note: "too late" }).expect(400);

    // A staff cancellation needs the reason the member will read.
    await send("post", ops, `/admin/set-pet/requests/${second.id}/status`).send({ to: "CANCELLED" }).expect(400);
    const cancelled = (await send("post", ops, `/admin/set-pet/requests/${second.id}/status`).send({ to: "CANCELLED", note: "The design shows a brand logo we can't print" }).expect(201)).body;
    expect(cancelled.cancelled).toMatchObject({ by: "STAFF", reason: "The design shows a brand logo we can't print" });

    const notes = await db.notification.findMany({ where: { userId: { in: [member.id, other.id] }, type: { startsWith: "set_pet." } }, select: { type: true, userId: true } });
    expect(notes.filter((n) => n.userId === member.id).map((n) => n.type).sort()).toEqual(["set_pet.in_production", "set_pet.quote_revised", "set_pet.quoted", "set_pet.shipped"]);
    expect(notes.filter((n) => n.userId === other.id).map((n) => n.type)).toEqual(["set_pet.cancelled"]);
    expect(await db.adminAuditLog.count({ where: { entityType: "SET_PET_REQUEST", entityId: req.id, action: { in: ["set_pet.quoted", "set_pet.status_changed"] } } })).toBe(4);

    // Staff note: staff-only, manage to write.
    await send("put", viewer, `/admin/set-pet/requests/${req.id}/admin-note`).send({ note: "x" }).expect(403);
    expect((await send("put", ops, `/admin/set-pet/requests/${req.id}/admin-note`).send({ note: "Called the member about the logo" }).expect(200)).body.adminNote).toBe("Called the member about the logo");

    // Designs: only READY files of a request, always as attachments, every opening audited with its reason.
    await send("post", viewer, `/admin/set-pet/files/${ready.id}/download`).send({ reason: "no" }).expect(400);
    const svg = (await send("post", viewer, `/admin/set-pet/files/${ready.id}/download`).send({ reason: "Check print resolution" }).expect(201)).body;
    expect(svg).toMatchObject({ fileId: ready.id, filename: "logo.svg" });
    expect(svg.downloadUrl).toBeTruthy();
    const png = (await send("post", viewer, `/admin/set-pet/files/${photo.id}/download`).send({ reason: "Check the pet photo" }).expect(201)).body;
    expect(png.filename).toMatch(/^design\.png$/);
    await send("post", viewer, `/admin/set-pet/files/${pending.id}/download`).send({ reason: "Check print resolution" }).expect(400);
    await send("post", viewer, `/admin/set-pet/files/${loose.id}/download`).send({ reason: "Check print resolution" }).expect(404);
    expect(await db.adminAuditLog.count({ where: { action: "set_pet.design_opened", entityId: req.id } })).toBe(2);
  });
});
