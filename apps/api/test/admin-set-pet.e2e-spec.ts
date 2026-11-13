import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, WalletBalanceType, WalletCreditSource } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { WalletService } from "../src/modules/commerce/payments/wallet.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * «ست پت» admin side (owner's #368 answers): queue, detail, the price table, print proofs (always), refusing a design,
 * production, shipping, cancellation with a wallet refund (print defects only after printing), audited downloads.
 */
describe("admin Set Pet orders", () => {
  let app: INestApplication, db: PrismaService, wallet: WalletService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const path = (url: string) => new URL(url).pathname.replace(/^\/api/, "");
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const prices = {
    garmentPricesIrr: { HUMAN_TEE: 4_000_000, HUMAN_HOODIE: 9_000_000, HUMAN_SWEATSHIRT: 7_000_000, PET_TEE: 2_500_000, PET_HOODIE: 4_000_000, PET_BANDANA: 1_500_000 },
    zonePricesIrr: { RIGHT_UPPER_ARM: 500_000, LEFT_UPPER_ARM: 500_000, FRONT_CENTER: 1_200_000, BACK: 1_200_000, PET_BACK: 800_000 },
    setDiscountPercent: 10,
    productionWorkingDays: 5,
  };

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `asp-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  /** An order as the member API writes it: two garments, two prints (an SVG and a photo). */
  async function order(member: Actor, status: "SUBMITTED" | "PAID" = "SUBMITTED") {
    const paid = status === "PAID" ? { totalPaidIrr: 9_600_000, paidPurchaseOnlyIrr: 9_600_000, paidWithdrawableIrr: 0, paidAt: new Date(), shippingProvider: "POST_PISHTAZ" as const, shippingIrr: 600_000, shippingAddress: { city: "Tehran" } } : {};
    const req = await db.setPetRequest.create({
      data: { userId: member.id, status, notes: "Name on the back", priceLines: [], subtotalIrr: 10_000_000, discountPercent: 10, discountIrr: 1_000_000, itemsTotalIrr: 9_000_000, ...paid },
    });
    await db.setPetRequestEvent.create({ data: { requestId: req.id, toStatus: "SUBMITTED", actor: "MEMBER", actorUserId: member.id } });
    await db.setPetItem.createMany({ data: [{ requestId: req.id, position: 0, garment: "HUMAN_TEE", size: "M", colour: "black" }, { requestId: req.id, position: 1, garment: "PET_HOODIE", size: "S", colour: "black", petName: "Lili", petSpecies: "CAT" }] });
    const vector = await db.setPetDesignFile.create({ data: { userId: member.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.svg`, mimeType: "image/svg+xml", fileSizeBytes: 2048, originalFilename: "logo.svg", previewable: false, status: "READY", uploadedAt: new Date() } });
    const photo = await db.setPetDesignFile.create({ data: { userId: member.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 4096, previewable: true, widthPx: 800, heightPx: 800, status: "READY", uploadedAt: new Date() } });
    const loose = await db.setPetDesignFile.create({ data: { userId: member.id, objectKey: `set-pet-designs/${member.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1, status: "READY" } });
    await db.setPetPlacement.create({ data: { requestId: req.id, zone: "FRONT_CENTER", designFileId: vector.id } });
    await db.setPetPlacement.create({ data: { requestId: req.id, zone: "PET_BACK", designFileId: photo.id } });
    return { req, vector, photo, loose };
  }

  /** Staff upload a proof image (target → PUT → send). */
  async function proof(ops: Actor, id: string, expectStatus: number, bytes = png, body: Record<string, unknown> = { note: "Front 20×20, pet back 18×18", petPrintWidthCm: 18, petPrintHeightCm: 18 }) {
    const target = (await send("post", ops, `/admin/set-pet/requests/${id}/proofs/upload-target`).send({ contentType: "image/png", fileSizeBytes: bytes.length }).expect(201)).body;
    const upload = request(server()).put(path(target.uploadUrl));
    for (const [k, v] of Object.entries((target.headers ?? {}) as Record<string, string>)) upload.set(k, v);
    const put = await upload.set("Content-Type", target.headers?.["Content-Type"] ?? "image/png").send(bytes);
    // The storage endpoint itself refuses bytes that are not the image type the key names (put.status 415).
    return { put, send: await send("post", ops, `/admin/set-pet/requests/${id}/proofs/${target.proofId}/send`).send(body).expect(expectStatus) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    wallet = app.get(WalletService);
  });
  afterAll(async () => app.close());

  it("keeps the fixed price table: commerce.view reads it, commerce.manage edits it, every change audited", async () => {
    const ops = await actor("Shop Ops", AdminRole.COMMERCE_OPERATIONS);
    const viewer = await actor("Read Only", AdminRole.READ_ONLY);
    const member = await actor("A member");
    await get(member, "/admin/set-pet/settings").expect(403);
    await send("put", viewer, "/admin/set-pet/settings").send(prices).expect(403);
    await send("put", ops, "/admin/set-pet/settings").send({ ...prices, setDiscountPercent: 95 }).expect(400);
    await send("put", ops, "/admin/set-pet/settings").send({ ...prices, garmentPricesIrr: { ...prices.garmentPricesIrr, HUMAN_TEE: 4_000_005 } }).expect(400);
    const saved = (await send("put", ops, "/admin/set-pet/settings").send({ ...prices, workshopCity: "Tehran" }).expect(200)).body;
    expect(saved).toMatchObject({ ...prices, workshopCity: "Tehran" });
    expect((await get(viewer, "/admin/set-pet/settings").expect(200)).body.zonePricesIrr.PET_BACK).toBe(800_000);
    expect(await db.adminAuditLog.count({ where: { action: "set_pet.prices_saved" } })).toBeGreaterThanOrEqual(1);
  });

  it("sends proofs, refuses designs, prints, ships and cancels — with a timeline row, an audit row and a member notification each time", async () => {
    const ops = await actor("Shop Ops", AdminRole.COMMERCE_OPERATIONS);
    const viewer = await actor("Read Only", AdminRole.READ_ONLY);
    const member = await actor("Sara Member");
    const other = await actor("Ali Member");
    const { req, vector, photo, loose } = await order(member);
    const second = (await order(other)).req;
    const number = `SP-${String(req.number).padStart(6, "0")}`;

    await get(member, "/admin/set-pet/requests").expect(403);
    const listed = (await get(viewer, `/admin/set-pet/requests?status=SUBMITTED&q=${number}`).expect(200)).body;
    expect(listed.items).toEqual([expect.objectContaining({ id: req.id, number, memberName: "Sara Member", humanGarments: 1, petGarments: 1, placements: 2, itemsTotalIrr: 9_000_000 })]);
    expect(listed.counts.SUBMITTED).toBe(1);
    expect((await get(viewer, `/admin/set-pet/requests?q=${encodeURIComponent("Ali Member")}`).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([second.id]);
    await get(viewer, "/admin/set-pet/requests?status=LOST").expect(400);
    expect((await get(viewer, "/admin/dashboard").expect(200)).body.newSetPetRequests).toBeGreaterThanOrEqual(2);

    const detail = (await get(viewer, `/admin/set-pet/requests/${req.id}`).expect(200)).body;
    expect(detail).toMatchObject({ number, status: "SUBMITTED", price: { totalIrr: 9_000_000 }, actions: { sendProof: true, rejectDesign: true, startProduction: false, cancel: true, refundsOnCancel: false } });
    expect(detail.items.map((i: { garment: string; petName: string | null }) => [i.garment, i.petName])).toEqual([["HUMAN_TEE", null], ["PET_HOODIE", "Lili"]]);
    expect(detail.placements.map((p: { zone: string; designFile: { widthPx: number | null } }) => [p.zone, p.designFile.widthPx])).toEqual([["FRONT_CENTER", null], ["PET_BACK", 800]]);
    expect(JSON.stringify(detail)).not.toContain("objectKey");
    await get(viewer, `/admin/set-pet/requests/${randomUUID()}`).expect(404);

    // Acting needs commerce.manage; no transition skips the proof or the payment.
    await send("post", viewer, `/admin/set-pet/requests/${req.id}/proofs/upload-target`).send({ contentType: "image/png", fileSizeBytes: 100 }).expect(403);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/proofs/upload-target`).send({ contentType: "image/svg+xml", fileSizeBytes: 100 }).expect(400);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "IN_PRODUCTION" }).expect(400);
    // A "proof" that isn't an image is refused and removed.
    // A "proof" that isn't an image never gets through: storage refuses the bytes, and nothing is sent.
    const fake = await proof(ops, req.id, 409, Buffer.from("<html>not an image</html>"));
    expect(fake.put.status).toBe(415);
    expect(fake.send.body.error.code).toBe("SET_PET_PROOF_NOT_UPLOADED");

    const proofed = (await proof(ops, req.id, 201)).send.body;
    expect(proofed).toMatchObject({ status: "PROOF_SENT", proofs: [{ status: "SENT", note: "Front 20×20, pet back 18×18", petPrintWidthCm: 18, uploadedBy: "Shop Ops" }] });
    expect((await get(viewer, `/admin/set-pet/requests/${req.id}/proofs/${proofed.proofs[0].id}`).expect(200)).body.url).toBeTruthy();
    // A newer proof replaces one the member has not answered.
    const again = (await proof(ops, req.id, 201, png, { note: "Bigger front print" })).send.body;
    expect(again.proofs.map((p: { status: string }) => p.status)).toEqual(["SENT", "SUPERSEDED"]);
    // The member sees the current proof through their own short-lived link.
    expect((await get(member, `/set-pet/requests/${req.id}/proof`).expect(200)).body.url).toBeTruthy();
    await get(other, `/set-pet/requests/${req.id}/proof`).expect(404);

    // The member approves and pays from the wallet (topped up by card-to-card).
    await send("post", member, `/set-pet/requests/${req.id}/approve-proof`).send({ proofId: again.proofs[0].id }).expect(201);
    await db.setPetSettings.upsert({ where: { id: "default" }, create: { id: "default", ...prices }, update: prices });
    const household = await db.household.create({ data: { name: "Sara's home" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: member.id, role: "OWNER" } });
    const address = await db.customerAddress.create({ data: { householdId: household.id, addressLine: "Street 1", city: "Shiraz", countryCode: "IR" } });
    await db.shippingMethodSetting.upsert({ where: { provider: "POST_PISHTAZ" }, create: { provider: "POST_PISHTAZ", enabled: true, config: { fixedPriceIrr: 600_000, includedKg: 1, perExtraKgIrr: 0, etaDaysMin: 2, etaDaysMax: 5 } }, update: { enabled: true, config: { fixedPriceIrr: 600_000, includedKg: 1, perExtraKgIrr: 0, etaDaysMin: 2, etaDaysMax: 5 } } });
    await wallet.credit({ userId: member.id, balanceType: WalletBalanceType.PURCHASE_ONLY, amount: 9_600_000, source: WalletCreditSource.TOP_UP, referenceType: "TEST_TOP_UP", referenceId: randomUUID() });
    await send("post", member, `/set-pet/requests/${req.id}/pay`).send({ addressId: address.id, shippingProvider: "POST_PISHTAZ", expectedTotalIrr: 9_600_000 }).expect(201);
    expect((await get(viewer, `/admin/set-pet/requests/${req.id}`).expect(200)).body).toMatchObject({ status: "PAID", payment: { totalPaidIrr: 9_600_000, shippingProvider: "POST_PISHTAZ" }, actions: { startProduction: true, refundsOnCancel: true } });

    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "SHIPPED", shippingNote: "x" }).expect(400);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "IN_PRODUCTION", note: "On the press" }).expect(201);
    // After printing starts, a cancellation is only for a print defect, confirmed explicitly.
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "CANCELLED", note: "Changed mind" }).expect(400);
    await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "SHIPPED" }).expect(400);
    const shipped = (await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "SHIPPED", shippingNote: "Post, tracking 123456" }).expect(201)).body;
    expect(shipped).toMatchObject({ status: "SHIPPED", shippingNote: "Post, tracking 123456", actions: { ship: false, printDefectOnly: true } });
    expect(shipped.timeline.map((e: { to: string; actor: string }) => `${e.actor}:${e.to}`)).toEqual(["MEMBER:SUBMITTED", "STAFF:PROOF_SENT", "STAFF:PROOF_SENT", "MEMBER:AWAITING_PAYMENT", "MEMBER:PAID", "STAFF:IN_PRODUCTION", "STAFF:SHIPPED"]);
    // A print defect after delivery: cancelled and refunded in full to the wallet.
    const defect = (await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "CANCELLED", note: "Print peeled after the first wash", printDefect: true }).expect(201)).body;
    expect(defect).toMatchObject({ status: "CANCELLED", payment: { refundedIrr: 9_600_000 }, cancelled: { by: "STAFF" } });
    expect(await wallet.getBalances(member.id)).toMatchObject({ PURCHASE_ONLY: 9_600_000 });

    // F9: a design that can't be printed goes back to the member with the reason.
    await send("post", ops, `/admin/set-pet/requests/${second.id}/reject-design`).send({ reason: "x" }).expect(400);
    const refused = (await send("post", ops, `/admin/set-pet/requests/${second.id}/reject-design`).send({ reason: "The logo is a registered brand" }).expect(201)).body;
    expect(refused).toMatchObject({ status: "NEEDS_NEW_DESIGN", designRejectReason: "The logo is a registered brand", actions: { sendProof: false, rejectDesign: false } });
    expect((await get(other, `/set-pet/requests/${second.id}`).expect(200)).body).toMatchObject({ status: "NEEDS_NEW_DESIGN", designRejectReason: "The logo is a registered brand", canEdit: true });
    // A staff cancellation needs the reason the member will read.
    await send("post", ops, `/admin/set-pet/requests/${second.id}/status`).send({ to: "CANCELLED" }).expect(400);
    const cancelled = (await send("post", ops, `/admin/set-pet/requests/${second.id}/status`).send({ to: "CANCELLED", note: "No new design after a week" }).expect(201)).body;
    expect(cancelled.cancelled).toMatchObject({ by: "STAFF", reason: "No new design after a week" });

    const notes = await db.notification.findMany({ where: { userId: { in: [member.id, other.id] }, type: { startsWith: "set_pet." } }, select: { type: true, userId: true } });
    expect(notes.filter((n) => n.userId === member.id).map((n) => n.type).sort()).toEqual(["set_pet.cancelled_refunded", "set_pet.in_production", "set_pet.proof_sent", "set_pet.proof_sent", "set_pet.shipped"]);
    expect(notes.filter((n) => n.userId === other.id).map((n) => n.type).sort()).toEqual(["set_pet.cancelled", "set_pet.needs_new_design"]);
    expect(await db.adminAuditLog.count({ where: { entityType: "SET_PET_REQUEST", entityId: req.id, action: { in: ["set_pet.proof_sent", "set_pet.status_changed"] } } })).toBe(5);

    // Staff note: staff-only, manage to write.
    await send("put", viewer, `/admin/set-pet/requests/${req.id}/admin-note`).send({ note: "x" }).expect(403);
    expect((await send("put", ops, `/admin/set-pet/requests/${req.id}/admin-note`).send({ note: "Reprint offered" }).expect(200)).body.adminNote).toBe("Reprint offered");

    // Designs: only READY files printed on this order, always as attachments, every opening audited with its reason.
    await send("post", viewer, `/admin/set-pet/requests/${req.id}/files/${vector.id}/download`).send({ reason: "no" }).expect(400);
    const svg = (await send("post", viewer, `/admin/set-pet/requests/${req.id}/files/${vector.id}/download`).send({ reason: "Check print resolution" }).expect(201)).body;
    expect(svg).toMatchObject({ fileId: vector.id, filename: "logo.svg" });
    expect(svg.downloadUrl).toBeTruthy();
    expect((await send("post", viewer, `/admin/set-pet/requests/${req.id}/files/${photo.id}/download`).send({ reason: "Check the pet photo" }).expect(201)).body.filename).toBe("design.png");
    await send("post", viewer, `/admin/set-pet/requests/${req.id}/files/${loose.id}/download`).send({ reason: "Check print resolution" }).expect(404);
    await send("post", viewer, `/admin/set-pet/requests/${second.id}/files/${vector.id}/download`).send({ reason: "Check print resolution" }).expect(404);
    expect(await db.adminAuditLog.count({ where: { action: "set_pet.design_opened", entityId: req.id } })).toBe(2);
  });

  it("refunds a paid order cancelled before printing", async () => {
    const ops = await actor("Shop Ops", AdminRole.COMMERCE_OPERATIONS);
    const member = await actor("Paid Member");
    const { req } = await order(member, "PAID");
    const cancelled = (await send("post", ops, `/admin/set-pet/requests/${req.id}/status`).send({ to: "CANCELLED", note: "Out of hoodies in this colour" }).expect(201)).body;
    expect(cancelled).toMatchObject({ status: "CANCELLED", payment: { refundedIrr: 9_600_000 } });
    expect(await wallet.getBalances(member.id)).toMatchObject({ PURCHASE_ONLY: 9_600_000 });
  });
});
