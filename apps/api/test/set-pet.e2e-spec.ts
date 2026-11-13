import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * «ست پت» member API: private design uploads checked by their bytes (photo metadata removed), fixed print zones, the
 * request lifecycle the member drives (send, accept the quote, cancel), and nobody else's rows reachable.
 */
describe("Set Pet requests (member side)", () => {
  let app: INestApplication, db: PrismaService, owner: Actor, stranger: Actor, petId: string;
  const server = () => app.getHttpServer();
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4" cx="5" cy="5"/></svg>');
  const measurements = { neckCm: 32, chestCm: 55.5, backLengthCm: 40, weightKg: 9.25 };
  const path = (url: string) => new URL(url).pathname.replace(/^\/api/, "");
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const get = (a: Actor | null, url: string) => (a ? request(server()).get(url).set("Cookie", a.cookie) : request(server()).get(url));

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `setpet-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400e3) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  /** Upload target → browser PUT (no CSRF, like a presigned URL) → complete. */
  async function upload(a: Actor, filename: string, contentType: string, bytes: Buffer, expectComplete = 201) {
    const target = await post(a, "/set-pet/designs/upload-target").send({ filename, contentType, fileSizeBytes: bytes.length }).expect(201);
    expect(target.body.file).toMatchObject({ status: "PENDING_UPLOAD", requestId: null });
    const put = request(server()).put(path(target.body.uploadUrl));
    for (const [k, v] of Object.entries((target.body.headers ?? {}) as Record<string, string>)) put.set(k, v);
    await put.set("Content-Type", target.body.headers?.["Content-Type"] ?? contentType).send(bytes).expect(200);
    const done = await post(a, `/set-pet/designs/${target.body.file.id}/complete`).send({}).expect(expectComplete);
    return { id: target.body.file.id as string, target: target.body, done: done.body };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    owner = await actor("Set Pet owner");
    stranger = await actor("Someone else");
    const household = await db.household.create({ data: { name: "Set Pet household" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: owner.id, role: "OWNER" } });
    petId = (await db.pet.create({ data: { householdId: household.id, name: "Shiraz", species: "DOG" } })).id;
    await db.petAccessGrant.create({ data: { petId, userId: owner.id, canEditIdentity: true, canManageAccess: true } });
  });
  afterAll(async () => { await app?.close(); });

  it("offers the fixed zones, sizes and file rules", async () => {
    const options = (await get(owner, "/set-pet/options").expect(200)).body;
    expect(options.zones).toEqual(expect.arrayContaining([{ zone: "FRONT_CENTER", garment: "HUMAN", widthCm: 20, heightCm: 20 }, { zone: "RIGHT_UPPER_ARM", garment: "HUMAN", widthCm: 10, heightCm: 10 }, { zone: "PET_BACK", garment: "PET", widthCm: null, heightCm: null }]));
    expect(options.sizes).toEqual(["S", "M", "L", "XL", "XXL", "XXXL"]);
    expect(options.acceptedExtensions).toEqual(expect.arrayContaining(["png", "heic", "svg", "ai", "psd", "pdf"]));
    await get(null, "/set-pet/options").expect(401);
  });

  it("checks uploads by their bytes: images become previewable, print files never are, impostors are rejected", async () => {
    const image = await upload(owner, "Front design.png", "image/png", png);
    expect(image.done).toMatchObject({ status: "READY", previewable: true, mimeType: "image/png", originalFilename: "Front design.png" });
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

    // Types that are not design files at all are refused before any upload.
    await post(owner, "/set-pet/designs/upload-target").send({ filename: "setup.exe", contentType: "application/octet-stream", fileSizeBytes: 100 }).expect(415);
    await post(owner, "/set-pet/designs/upload-target").send({ filename: "big.png", contentType: "image/png", fileSizeBytes: 60 * 1024 * 1024 }).expect(400);

    // A file not on a request can be removed; listing shows only the member's own unplaced files.
    const spare = await upload(owner, "spare.png", "image/png", png);
    expect((await get(owner, "/set-pet/designs").expect(200)).body.map((f: { id: string }) => f.id)).toEqual(expect.arrayContaining([image.id, vector.id, spare.id]));
    await request(server()).delete(`/set-pet/designs/${spare.id}`).set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(200);
    expect(await db.setPetDesignFile.findUnique({ where: { id: spare.id } })).toBeNull();
  });

  it("sends a request with designs on fixed zones, then the member accepts the quote; strangers see nothing", async () => {
    const front = await upload(owner, "front.png", "image/png", png);
    const back = await upload(owner, "back.svg", "image/svg+xml", svg);
    const body = { petId, humanColour: "مشکی", humanSizes: ["M", "XXL"], petSize: "S", petColour: "مشکی", petMeasurements: measurements, placements: [{ zone: "FRONT_CENTER", designFileId: front.id }, { zone: "RIGHT_UPPER_ARM", designFileId: front.id }, { zone: "PET_BACK", designFileId: back.id }], notes: "برای تولد" };

    // Validation before anything is written.
    await post(owner, "/set-pet/requests").send({ ...body, placements: [{ zone: "BACK", designFileId: front.id }, { zone: "BACK", designFileId: back.id }] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, petMeasurements: { ...measurements, weightKg: 400 } }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, humanSizes: ["XXXXL"] }).expect(400);
    await post(owner, "/set-pet/requests").send({ ...body, placements: [{ zone: "SLEEVE", designFileId: front.id }] }).expect(400);
    // Someone else's designs or pet can't be used.
    await post(stranger, "/set-pet/requests").send({ ...body, petId: undefined }).expect(409);
    await post(stranger, "/set-pet/requests").send({ ...body, placements: [] }).expect(400);
    const strangerPet = await post(stranger, "/set-pet/requests").send({ ...body, placements: [{ zone: "BACK", designFileId: randomUUID() }] });
    expect([404, 409]).toContain(strangerPet.status);

    const created = (await post(owner, "/set-pet/requests").send(body).expect(201)).body;
    expect(created).toMatchObject({ status: "SUBMITTED", petId, humanSizes: ["M", "XXL"], petMeasurements: measurements, quote: null, notes: "برای تولد" });
    expect(created.reference).toMatch(/^SP-\d{6}$/);
    expect(created.placements).toEqual(expect.arrayContaining([{ zone: "FRONT_CENTER", designFileId: front.id }, { zone: "RIGHT_UPPER_ARM", designFileId: front.id }, { zone: "PET_BACK", designFileId: back.id }]));
    expect(created.designs.map((d: { id: string; requestId: string }) => [d.id, d.requestId]).sort()).toEqual([[front.id, created.id], [back.id, created.id]].sort());
    expect(created.timeline).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "SUBMITTED", actor: "MEMBER" })]);
    expect(await db.domainEvent.count({ where: { type: "SetPetRequestSubmitted", aggregateId: created.id } })).toBe(1);
    // A placed design is spent: not reusable, not removable.
    await post(owner, "/set-pet/requests").send({ ...body, placements: [{ zone: "BACK", designFileId: front.id }] }).expect(409);
    await request(server()).delete(`/set-pet/designs/${front.id}`).set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(409);

    // Nobody else reaches it: the same 404 as a missing id.
    for (const url of [`/set-pet/requests/${created.id}`, `/set-pet/designs/${front.id}/preview`]) await get(stranger, url).expect(404);
    await post(stranger, `/set-pet/requests/${created.id}/cancel`).send({}).expect(404);
    await post(stranger, `/set-pet/requests/${created.id}/accept-quote`).send({}).expect(404);
    await post(stranger, `/set-pet/designs/${front.id}/complete`).send({}).expect(404);
    expect((await get(stranger, "/set-pet/requests").expect(200)).body).toEqual([]);
    await get(null, `/set-pet/requests/${created.id}`).expect(401);

    // No quote yet → nothing to accept.
    expect((await post(owner, `/set-pet/requests/${created.id}/accept-quote`).send({}).expect(409)).body.error.code).toBe("SET_PET_NO_QUOTE");
    // Staff quote (the admin queue does this; written directly here) — the staff-only note never reaches the member.
    await db.setPetRequest.update({ where: { id: created.id }, data: { status: "QUOTED", quoteAmountIrr: 45_000_000, quoteNote: "دو هفته", quotedAt: new Date(), adminNote: "INTERNAL-ONLY" } });
    await db.setPetRequestEvent.create({ data: { requestId: created.id, fromStatus: "SUBMITTED", toStatus: "QUOTED", actor: "STAFF", note: "قیمت اعلام شد" } });
    const quoted = await get(owner, `/set-pet/requests/${created.id}`).expect(200);
    expect(quoted.body.quote).toMatchObject({ amountIrr: 45_000_000, note: "دو هفته" });
    expect(JSON.stringify(quoted.body)).not.toContain("INTERNAL-ONLY");
    const confirmed = (await post(owner, `/set-pet/requests/${created.id}/accept-quote`).send({}).expect(201)).body;
    expect(confirmed).toMatchObject({ status: "CONFIRMED" });
    expect(confirmed.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["SUBMITTED", "QUOTED", "CONFIRMED"]);
    expect(await db.domainEvent.count({ where: { type: "SetPetQuoteAccepted", aggregateId: created.id } })).toBe(1);
    // Once confirmed, production may start: the member can't cancel here any more.
    expect((await post(owner, `/set-pet/requests/${created.id}/cancel`).send({}).expect(409)).body.error.code).toBe("SET_PET_NOT_CANCELLABLE");
  });

  it("lets the member cancel before accepting, and caps open requests", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const design = await upload(owner, `d${i}.png`, "image/png", png);
      ids.push((await post(owner, "/set-pet/requests").send({ humanColour: "سفید", humanSizes: ["L"], petSize: "M", petColour: "سفید", petMeasurements: measurements, placements: [{ zone: "BACK", designFileId: design.id }] }).expect(201)).body.id);
    }
    const extra = await upload(owner, "extra.png", "image/png", png);
    const capped = await post(owner, "/set-pet/requests").send({ humanColour: "سفید", humanSizes: ["L"], petSize: "M", petColour: "سفید", petMeasurements: measurements, placements: [{ zone: "BACK", designFileId: extra.id }] }).expect(409);
    expect(capped.body.error.code).toBe("SET_PET_TOO_MANY_OPEN");
    const cancelled = (await post(owner, `/set-pet/requests/${ids[0]}/cancel`).send({ reason: "منصرف شدم" }).expect(201)).body;
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledBy: "MEMBER", cancelReason: "منصرف شدم" });
    expect(cancelled.timeline.at(-1)).toMatchObject({ fromStatus: "SUBMITTED", toStatus: "CANCELLED", actor: "MEMBER" });
    await post(owner, "/set-pet/requests").send({ humanColour: "سفید", humanSizes: ["L"], petSize: "M", petColour: "سفید", petMeasurements: measurements, placements: [{ zone: "BACK", designFileId: extra.id }] }).expect(201);
  });
});
