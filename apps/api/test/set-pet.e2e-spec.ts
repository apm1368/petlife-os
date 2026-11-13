import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { WalletBalanceType, WalletCreditSource } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { WalletService } from "../src/modules/commerce/payments/wallet.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * «ست پت» member API (owner's #368 answers): private design uploads checked by their bytes, a fixed price table, the
 * P8 rule, edits until the proof is approved, wallet payment, free cancellation with a refund until printing, reorder,
 * drafts — and nobody else's rows reachable.
 */
describe("Set Pet orders (member side)", () => {
  let app: INestApplication, db: PrismaService, wallet: WalletService, owner: Actor, stranger: Actor, petId: string, catId: string, goneId: string, addressId: string;
  const server = () => app.getHttpServer();
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4" cx="5" cy="5"/></svg>');
  const path = (url: string) => new URL(url).pathname.replace(/^\/api/, "");
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const put = (a: Actor, url: string) => request(server()).put(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const get = (a: Actor | null, url: string) => (a ? request(server()).get(url).set("Cookie", a.cookie) : request(server()).get(url));
  const prices = {
    garmentPricesIrr: { HUMAN_TEE: 4_000_000, HUMAN_HOODIE: 9_000_000, HUMAN_SWEATSHIRT: 7_000_000, PET_TEE: 2_500_000, PET_HOODIE: 4_000_000, PET_BANDANA: 1_500_000 },
    zonePricesIrr: { RIGHT_UPPER_ARM: 500_000, LEFT_UPPER_ARM: 500_000, FRONT_CENTER: 1_200_000, BACK: 1_200_000, PET_BACK: 800_000 },
    setDiscountPercent: 10,
  };
  const post600 = { fixedPriceIrr: 600_000, includedKg: 1, perExtraKgIrr: 100_000, etaDaysMin: 2, etaDaysMax: 5 };

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `setpet-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400e3) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  /** Upload target → browser PUT (no CSRF, like a presigned URL) → complete. */
  async function upload(a: Actor, filename: string, contentType: string, bytes: Buffer, expectComplete = 201) {
    const target = await post(a, "/set-pet/designs/upload-target").send({ filename, contentType, fileSizeBytes: bytes.length }).expect(201);
    expect(target.body.file).toMatchObject({ status: "PENDING_UPLOAD" });
    const upload = request(server()).put(path(target.body.uploadUrl));
    for (const [k, v] of Object.entries((target.body.headers ?? {}) as Record<string, string>)) upload.set(k, v);
    await upload.set("Content-Type", target.body.headers?.["Content-Type"] ?? contentType).send(bytes).expect(200);
    const done = await post(a, `/set-pet/designs/${target.body.file.id}/complete`).send({}).expect(expectComplete);
    return { id: target.body.file.id as string, target: target.body, done: done.body };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    wallet = app.get(WalletService);
    owner = await actor("Set Pet owner");
    stranger = await actor("Someone else");
    const household = await db.household.create({ data: { name: "Set Pet household" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: owner.id, role: "OWNER" } });
    const pet = async (name: string, species: "DOG" | "CAT", lifecycleStatus: "ACTIVE" | "DECEASED" = "ACTIVE") => {
      const id = (await db.pet.create({ data: { householdId: household.id, name, species, lifecycleStatus } })).id;
      await db.petAccessGrant.create({ data: { petId: id, userId: owner.id, canEditIdentity: true, canManageAccess: true } });
      return id;
    };
    petId = await pet("Shiraz", "DOG");
    catId = await pet("Kaveh", "CAT");
    goneId = await pet("Pashmak", "DOG", "DECEASED");
    addressId = (await db.customerAddress.create({ data: { householdId: household.id, addressLine: "Valiasr St", city: "Tehran", countryCode: "IR", recipient: "Owner" } })).id;
    await db.shippingMethodSetting.upsert({ where: { provider: "POST_PISHTAZ" }, create: { provider: "POST_PISHTAZ", enabled: true, config: post600 }, update: { enabled: true, config: post600 } });
  });
  afterAll(async () => { await app?.close(); });

  it("offers the catalogue publicly (the builder works before sign-in); sending waits for the price table", async () => {
    await db.setPetSettings.deleteMany({});
    const options = (await get(null, "/set-pet/options").expect(200)).body;
    expect(options.zones).toEqual(expect.arrayContaining([{ zone: "FRONT_CENTER", wearer: "HUMAN", widthCm: 20, heightCm: 20 }, { zone: "RIGHT_UPPER_ARM", wearer: "HUMAN", widthCm: 10, heightCm: 10 }, { zone: "PET_BACK", wearer: "PET", widthCm: null, heightCm: null }]));
    expect(options.sizes).toEqual(["S", "M", "L", "XL", "XXL", "XXXL"]);
    expect(options.garments).toEqual(["HUMAN_TEE", "HUMAN_HOODIE", "HUMAN_SWEATSHIRT", "PET_TEE", "PET_HOODIE", "PET_BANDANA"]);
    expect(options.fonts).toHaveLength(3);
    expect(Object.keys(options.colours)).toHaveLength(6);
    expect(options.limits).toMatchObject({ maxHumanGarments: 5, maxFileBytes: 50 * 1024 * 1024 });
    expect(options.acceptedExtensions).toEqual(expect.arrayContaining(["png", "heic", "svg", "ai", "psd", "pdf"]));
    expect(options.pricesReady).toBe(false);
    // Everything else needs a session.
    await get(null, "/set-pet/requests").expect(401);
    await get(null, "/set-pet/draft").expect(401);
    await get(null, "/set-pet/designs").expect(401);
  });

  it("checks uploads by their bytes: images become previewable, print files never are, impostors are rejected", async () => {
    const image = await upload(owner, "Front design.png", "image/png", png);
    expect(image.done).toMatchObject({ status: "READY", previewable: true, mimeType: "image/png", originalFilename: "Front design.png", widthPx: 1, heightPx: 1 });
    expect(image.target.uploadUrl).not.toContain("set-pet-designs"); // the private key is never handed out as a URL
    const preview = (await get(owner, `/set-pet/designs/${image.id}/preview`).expect(200)).body;
    const served = await request(server()).get(path(preview.url)).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect((served.body as Buffer).subarray(0, 8).equals(png.subarray(0, 8))).toBe(true);

    // SVG: stored as opaque bytes, never previewed (an SVG can carry script).
    const vector = await upload(owner, "pet-back.svg", "image/svg+xml", svg);
    expect(vector.target.headers?.["Content-Type"]).toBe("application/octet-stream");
    expect(vector.done).toMatchObject({ status: "READY", previewable: false, mimeType: "image/svg+xml" });
    await get(owner, `/set-pet/designs/${vector.id}/preview`).expect(404);

    // A "PDF" that is really HTML is refused and removed.
    const fake = await upload(owner, "print.pdf", "application/pdf", Buffer.from("<html><script>alert(1)</script></html>"), 422);
    expect(fake.done.error).toMatchObject({ code: "SET_PET_FILE_REJECTED", details: { reason: "CONTENT_DOES_NOT_MATCH_TYPE" } });
    expect(await db.setPetDesignFile.findUniqueOrThrow({ where: { id: fake.id } })).toMatchObject({ status: "REJECTED" });

    // Not design files at all, or over 50 MB, are refused before any upload.
    await post(owner, "/set-pet/designs/upload-target").send({ filename: "setup.exe", contentType: "application/octet-stream", fileSizeBytes: 100 }).expect(415);
    await post(owner, "/set-pet/designs/upload-target").send({ filename: "big.png", contentType: "image/png", fileSizeBytes: 51 * 1024 * 1024 }).expect(400);

    // A file on no order can be removed; the list shows only the member's own checked files.
    const spare = await upload(owner, "spare.png", "image/png", png);
    expect((await get(owner, "/set-pet/designs").expect(200)).body.map((f: { id: string }) => f.id)).toEqual(expect.arrayContaining([image.id, vector.id, spare.id]));
    expect((await get(stranger, "/set-pet/designs").expect(200)).body).toEqual([]);
    await request(server()).delete(`/set-pet/designs/${spare.id}`).set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(200);
    expect(await db.setPetDesignFile.findUnique({ where: { id: spare.id } })).toBeNull();
  });

  it("prices from the fixed table, enforces P8, edits until the proof is approved, pays from the wallet and refunds on cancel", async () => {
    const front = await upload(owner, "front.png", "image/png", png);
    const back = await upload(owner, "back.svg", "image/svg+xml", svg);
    const body = {
      items: [
        { garment: "HUMAN_TEE", size: "M", colour: "black" },
        { garment: "HUMAN_HOODIE", size: "XXL", colour: "black" },
        { garment: "PET_HOODIE", size: "S", colour: "black", petId },
        { garment: "PET_BANDANA", size: "M", colour: "sage", petName: "Lili", petSpecies: "CAT" },
      ],
      placements: [
        { zone: "FRONT_CENTER", designFileId: front.id, scale: 1.5, offsetX: 0.2, offsetY: -0.1 },
        { zone: "RIGHT_UPPER_ARM", text: "شیراز", font: "LALEZAR", textColour: "white" },
        { zone: "PET_BACK", designFileId: back.id },
      ],
      notes: "برای تولد",
    };

    // Until staff price every garment and zone, nothing can be sent.
    expect((await post(owner, "/set-pet/requests").send(body).expect(409)).body.error.code).toBe("SET_PET_PRICES_NOT_SET");
    await db.setPetSettings.upsert({ where: { id: "default" }, create: { id: "default", ...prices }, update: prices });
    expect((await get(null, "/set-pet/options").expect(200)).body).toMatchObject({ pricesReady: true, prices: { setDiscountPercent: 10 } });

    // Validation before anything is written.
    await post(owner, "/set-pet/requests").send({ ...body, placements: [body.placements[0], { ...body.placements[0] }] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, items: [{ garment: "HUMAN_TEE", size: "XXXXL", colour: "black" }] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, items: [...body.items.slice(0, 2), { garment: "PET_TEE", size: "S", colour: "black", petName: "Tweety", petSpecies: "BIRD" }] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, placements: [{ zone: "FRONT_CENTER", designFileId: front.id, text: "both" }] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, placements: [{ zone: "BACK", text: "x", font: "COMIC" }] }).expect(400);
    const six = Array.from({ length: 6 }, () => ({ garment: "HUMAN_TEE", size: "L", colour: "white" }));
    await post(owner, "/set-pet/requests").send({ ...body, items: [...six, body.items[2]] }).expect(400);
    // P8: a pet that is with the member gets its garment; human-only only in memory of a pet that is lost or gone.
    const humanOnly = { items: body.items.slice(0, 2), placements: body.placements.slice(0, 2) };
    expect((await post(owner, "/set-pet/requests").send(humanOnly).expect(400)).body.error.details).toMatchObject({ reason: "PET_GARMENT_REQUIRED" });
    expect((await post(owner, "/set-pet/requests").send({ ...humanOnly, forPetId: catId }).expect(400)).body.error.details).toMatchObject({ reason: "PET_GARMENT_REQUIRED" });
    const memorial = (await post(owner, "/set-pet/requests").send({ ...humanOnly, forPetId: goneId }).expect(201)).body;
    expect(memorial).toMatchObject({ status: "SUBMITTED", forPetId: goneId, price: { discountPercent: 0 } });
    await post(owner, `/set-pet/requests/${memorial.id}/cancel`).send({}).expect(201);
    // Someone else's pet or designs can't be used.
    await post(stranger, "/set-pet/requests").send({ ...humanOnly, forPetId: goneId }).expect(404);
    expect((await post(stranger, "/set-pet/requests").send({ ...body, items: [body.items[0], body.items[3]] }).expect(409)).body.error.code).toBe("SET_PET_DESIGN_UNAVAILABLE");

    const created = (await post(owner, "/set-pet/requests").send(body).expect(201)).body;
    expect(created.reference).toMatch(/^SP-\d{6}$/);
    expect(created).toMatchObject({ status: "SUBMITTED", notes: "برای تولد", canEdit: true, canCancel: true, proof: null });
    expect(created.items.map((i: { garment: string; petSpecies: string | null }) => [i.garment, i.petSpecies])).toEqual([["HUMAN_TEE", null], ["HUMAN_HOODIE", null], ["PET_HOODIE", "DOG"], ["PET_BANDANA", "CAT"]]);
    expect(created.placements[0]).toMatchObject({ zone: "RIGHT_UPPER_ARM", text: "شیراز", font: "LALEZAR", designFileId: null });
    expect(created.placements.find((p: { zone: string }) => p.zone === "FRONT_CENTER")).toMatchObject({ scale: 1.5, offsetX: 0.2, offsetY: -0.1 });
    // P36/P37: tee 4.0 + hoodie 9.0 + 2 × (front 1.2 + sleeve 0.5) + pet hoodie 4.0 + bandana 1.5 + 2 × back 0.8 = 23.5 M; 10% set discount.
    expect(created.price).toMatchObject({ subtotalIrr: 23_500_000, discountPercent: 10, discountIrr: 2_350_000, totalIrr: 21_150_000 });
    expect(await db.domainEvent.count({ where: { type: "SetPetRequestSubmitted", aggregateId: created.id } })).toBe(1);
    // A design on an order can't be removed (it may be reused on another order).
    await request(server()).delete(`/set-pet/designs/${front.id}`).set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(409);

    // Nobody else reaches it: the same 404 as a missing id.
    for (const url of [`/set-pet/requests/${created.id}`, `/set-pet/designs/${front.id}/preview`, `/set-pet/requests/${created.id}/proof`, `/set-pet/requests/${created.id}/shipping-options?addressId=${addressId}`]) await get(stranger, url).expect(404);
    for (const action of ["cancel", "reorder"]) await post(stranger, `/set-pet/requests/${created.id}/${action}`).send({}).expect(404);
    await post(stranger, `/set-pet/requests/${created.id}/approve-proof`).send({ proofId: randomUUID() }).expect(404);
    await put(stranger, `/set-pet/requests/${created.id}`).send({ ...body, placements: [body.placements[1]], items: [body.items[0], body.items[3]] }).expect(404);
    expect((await get(stranger, "/set-pet/requests").expect(200)).body).toEqual([]);

    // P39: editing while waiting for the proof re-prices from the table.
    const edited = (await put(owner, `/set-pet/requests/${created.id}`).send({ ...body, items: [body.items[0], body.items[2]], placements: [body.placements[0], body.placements[2]] }).expect(200)).body;
    expect(edited).toMatchObject({ status: "SUBMITTED", price: { subtotalIrr: 10_000_000, discountIrr: 1_000_000, totalIrr: 9_000_000 } });

    // Staff send a proof (the admin queue does this; written directly here) — the staff-only note never reaches the member.
    const proof = await db.setPetProof.create({ data: { requestId: created.id, objectKey: `set-pet-proofs/${created.id}/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: png.length, status: "SENT", sentAt: new Date(), note: "پشت پت ۱۸×۱۸", petPrintWidthCm: 18, petPrintHeightCm: 18, uploadedByAdminUserId: randomUUID() } });
    await db.setPetRequest.update({ where: { id: created.id }, data: { status: "PROOF_SENT", adminNote: "INTERNAL-ONLY" } });
    const proofed = (await get(owner, `/set-pet/requests/${created.id}`).expect(200)).body;
    expect(proofed.proof).toMatchObject({ id: proof.id, status: "SENT", petPrintWidthCm: 18 });
    expect(JSON.stringify(proofed)).not.toContain("INTERNAL-ONLY");
    expect((await post(owner, `/set-pet/requests/${created.id}/approve-proof`).send({ proofId: randomUUID() }).expect(409)).body.error.code).toBe("SET_PET_PROOF_CHANGED");
    expect((await get(owner, `/set-pet/requests/${created.id}`).expect(200)).body.status).toBe("PROOF_SENT");
    const approved = (await post(owner, `/set-pet/requests/${created.id}/approve-proof`).send({ proofId: proof.id }).expect(201)).body;
    expect(approved).toMatchObject({ status: "AWAITING_PAYMENT", canEdit: false, proof: { status: "APPROVED" } });
    expect((await put(owner, `/set-pet/requests/${created.id}`).send(body).expect(409)).body.error.code).toBe("SET_PET_NOT_EDITABLE");

    // Shipping by the shop's methods: Post at its fixed price (two garments ≈ 0.7 kg, under the included kilo).
    const options = (await get(owner, `/set-pet/requests/${created.id}/shipping-options?addressId=${addressId}`).expect(200)).body;
    expect(options).toEqual([{ provider: "POST_PISHTAZ", priceIrr: 600_000, etaDays: 5 }]);
    const total = 9_000_000 + 600_000;
    const pay = { addressId, shippingProvider: "POST_PISHTAZ", expectedTotalIrr: total };
    expect((await post(owner, `/set-pet/requests/${created.id}/pay`).send({ ...pay, expectedTotalIrr: total - 10 }).expect(409)).body.error.code).toBe("SET_PET_TOTAL_CHANGED");
    expect((await post(owner, `/set-pet/requests/${created.id}/pay`).send(pay).expect(400)).body.error.details).toMatchObject({ reason: "INSUFFICIENT_WALLET_BALANCE" });
    expect((await get(owner, `/set-pet/requests/${created.id}`).expect(200)).body.status).toBe("AWAITING_PAYMENT");
    await post(owner, `/set-pet/requests/${created.id}/pay`).send({ ...pay, addressId: randomUUID() }).expect(404);
    await post(stranger, `/set-pet/requests/${created.id}/pay`).send(pay).expect(404);

    // A card-to-card top-up lands in the purchase-only bucket; a refund left withdrawable money too.
    await wallet.credit({ userId: owner.id, balanceType: WalletBalanceType.PURCHASE_ONLY, amount: 8_000_000, source: WalletCreditSource.TOP_UP, referenceType: "TEST_TOP_UP", referenceId: randomUUID() });
    await wallet.credit({ userId: owner.id, balanceType: WalletBalanceType.WITHDRAWABLE, amount: 2_000_000, source: WalletCreditSource.REFUND, referenceType: "TEST_REFUND", referenceId: randomUUID() });
    const paid = (await post(owner, `/set-pet/requests/${created.id}/pay`).send(pay).expect(201)).body;
    expect(paid).toMatchObject({ status: "PAID", canCancel: true, payment: { shippingProvider: "POST_PISHTAZ", shippingIrr: 600_000, totalPaidIrr: total } });
    expect(new Date(paid.estimatedReadyAt).getTime()).toBeGreaterThan(Date.now() + 4 * 86400e3);
    // A second click never charges twice.
    await post(owner, `/set-pet/requests/${created.id}/pay`).send(pay).expect(201);
    expect(await wallet.getBalances(owner.id)).toMatchObject({ WITHDRAWABLE: 0, PURCHASE_ONLY: 400_000 });

    // F8: free cancellation until printing; the refund goes back to the buckets it came from.
    const cancelled = (await post(owner, `/set-pet/requests/${created.id}/cancel`).send({ reason: "منصرف شدم" }).expect(201)).body;
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledBy: "MEMBER", cancelReason: "منصرف شدم", refundedIrr: total });
    expect(await wallet.getBalances(owner.id)).toMatchObject({ WITHDRAWABLE: 2_000_000, PURCHASE_ONLY: 8_000_000 });
    expect(cancelled.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["SUBMITTED", "SUBMITTED", "AWAITING_PAYMENT", "PAID", "CANCELLED"]);
    await post(owner, `/set-pet/requests/${created.id}/cancel`).send({}).expect(409);

    // P40: reorder copies the set into the builder draft, ready for review.
    const draft = (await post(owner, `/set-pet/requests/${created.id}/reorder`).send({}).expect(201)).body;
    expect(draft.data).toMatchObject({ reorderOfId: created.id, step: "review", items: [{ garment: "HUMAN_TEE" }, { garment: "PET_HOODIE", petId }] });
    expect((await get(owner, "/set-pet/draft").expect(200)).body.draft.data.reorderOfId).toBe(created.id);
    const { items, placements, forPetId, notes, reorderOfId } = draft.data as Record<string, unknown>;
    const again = (await post(owner, "/set-pet/requests").send({ items, placements, forPetId, notes, reorderOfId }).expect(201)).body;
    expect(again).toMatchObject({ status: "SUBMITTED", price: { totalIrr: 9_000_000 } });
    // Sending clears the draft.
    expect((await get(owner, "/set-pet/draft").expect(200)).body).toEqual({ draft: null });
  });

  it("keeps one size-capped draft per member (P5)", async () => {
    await put(owner, "/set-pet/draft").send({ data: { step: "garments", items: [{ garment: "HUMAN_TEE" }] } }).expect(200);
    expect((await get(owner, "/set-pet/draft").expect(200)).body.draft.data).toEqual({ step: "garments", items: [{ garment: "HUMAN_TEE" }] });
    await put(owner, "/set-pet/draft").send({ data: { blob: "x".repeat(70 * 1024) } }).expect(400);
    await put(owner, "/set-pet/draft").send({ data: [1, 2] }).expect(400);
    expect((await get(stranger, "/set-pet/draft").expect(200)).body).toEqual({ draft: null });
    await request(server()).delete("/set-pet/draft").set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(200);
    expect((await get(owner, "/set-pet/draft").expect(200)).body).toEqual({ draft: null });
  });
});
