import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TRAVEL_SOURCE_ADAPTERS } from "../src/modules/travel-external/adapters/adapter-registry";
import { FixtureAdapter } from "../src/modules/travel-external/adapters/fixture.adapter";
import { AdapterError, type AdapterListing } from "../src/modules/travel-external/adapters/travel-source-adapter";
import { TravelExternalService } from "../src/modules/travel-external/travel-external.service";

type Actor = { id: string; cookie: string; csrf: string };
const DAY = 86400e3;
const iso = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

/** TRAVEL-EXT contract: FIXTURE adapter (synthetic, labelled fixture data) drives the real pipeline; JABAMA/ALIBABA run only as MANUAL here. */
describe("External pet-friendly stays", () => {
  let app: INestApplication, db: PrismaService, fixture: FixtureAdapter;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const city = `FixtureCity-${randomUUID().slice(0, 6)}`;
  const listing = (id: string, extra: Partial<AdapterListing> = {}): AdapterListing => ({ sourceListingId: id, sourceUrl: `https://www.fixture.example/stay/${id}`, title: `Fixture villa ${id} (fixture data)`, city, stayType: "VILLA", capacity: 6, petEvidence: { type: "SOURCE_AMENITY", text: "Fixture: pets allowed (synthetic)" }, petPolicy: { dogs: true }, imageUrls: [`https://img.fixture.example/${id}.jpg`, "https://evil.example/x.jpg"], ...extra });

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `tx-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
    fixture = app.get<Map<string, FixtureAdapter>>(TRAVEL_SOURCE_ADAPTERS).get("FIXTURE")!;
    await db.externalTravelSource.upsert({ where: { code: "FIXTURE" }, create: { code: "FIXTURE", nameFa: "منبع آزمایشی", nameEn: "Fixture source", allowedHosts: ["fixture.example"], mode: "AUTOMATED", automationStatus: "SUPPORTED", health: "HEALTHY", autoPublish: true, imagePolicy: "REMOTE_REFERENCE", priceTtlMinutes: 60 }, update: { mode: "AUTOMATED", automationStatus: "SUPPORTED", autoPublish: true, imagePolicy: "REMOTE_REFERENCE", circuitOpenUntil: null, consecutiveFailures: 0 } });
  });
  afterAll(async () => app.close());

  it("sync pipeline: pet evidence required, idempotent, single-flight, change detection, removal, circuit breaker; never deletes", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const a = `a-${randomUUID().slice(0, 6)}`, b = `b-${randomUUID().slice(0, 6)}`;
    fixture.script = { listings: [listing(a), listing(b, { petEvidence: null })] };
    await send("post", ro, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(403);
    const run1 = (await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201)).body;
    expect(run1).toMatchObject({ status: "PARTIAL", created: 1, failed: 1, errorCategories: { NO_PET_EVIDENCE: 1 } });
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: a }, include: { images: true } });
    expect(stay).toMatchObject({ publishState: "PUBLISHED", status: "ACTIVE", petEvidenceType: "SOURCE_AMENITY", entryMode: "AUTOMATED" });
    expect(stay.images.map((i) => i.sourceImageUrl)).toEqual([`https://img.fixture.example/${a}.jpg`]); // off-allowlist image dropped
    expect(await db.externalStay.count({ where: { sourceListingId: b } })).toBe(0);

    fixture.script = { listings: [listing(a)] };
    expect((await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201)).body).toMatchObject({ status: "SUCCEEDED", created: 0, unchanged: 1 });
    // Single flight: a concurrent run of the same source is refused.
    fixture.script.delayMs = 700;
    const [r1, r2] = await Promise.all([send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "DISCOVERY" }), send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "DISCOVERY" })]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    fixture.script.delayMs = 0;

    fixture.script = { listings: [listing(a, { petEvidence: { type: "SOURCE_POLICY_TEXT", text: "Fixture: only small dogs" }, petPolicy: { dogs: true, sizeLimit: "SMALL" } })] };
    await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201);
    expect(await db.externalStayChange.count({ where: { stayId: stay.id, kind: "PET_POLICY_CHANGED" } })).toBe(1);

    // Removed at the source → SOURCE_REMOVED (kept), invisible to members.
    fixture.script = { listings: [], removed: [a] };
    await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201);
    expect((await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).status).toBe("SOURCE_REMOVED");
    await get(null, `/travel/external/stays/${stay.id}`).expect(404);

    // Source blocks us → FAILED, health BLOCKED, circuit open; listings untouched; next run cancelled by the breaker.
    fixture.script = { listings: [listing(a)] };
    await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201); // back to ACTIVE
    fixture.script = { listings: [], fail: new AdapterError("BLOCKED_EXTERNAL", "fixture block") };
    expect((await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201)).body.status).toBe("FAILED");
    const src = (await get(ro, "/admin/travel/external/sources/FIXTURE").expect(200)).body;
    expect(src).toMatchObject({ health: "BLOCKED", lastErrorCategory: "BLOCKED_EXTERNAL" });
    expect(src.circuitOpenUntil).toBeTruthy();
    expect((await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).status).toBe("ACTIVE");
    expect((await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201)).body.status).toBe("CANCELLED");
    await db.externalTravelSource.update({ where: { code: "FIXTURE" }, data: { circuitOpenUntil: null, consecutiveFailures: 0 } });

    // Stuck runs never lock forever.
    const src0 = await db.externalTravelSource.findUniqueOrThrow({ where: { code: "FIXTURE" } });
    const stuck = await db.externalSyncRun.create({ data: { sourceId: src0.id, kind: "FULL", startedAt: new Date(Date.now() - 3 * 3600e3) } });
    await app.get(TravelExternalService).abandonStuckRuns();
    expect((await db.externalSyncRun.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("ABANDONED");
    expect(await db.adminAuditLog.count({ where: { entityId: "FIXTURE", action: "travel_source.sync_run" } })).toBeGreaterThanOrEqual(6);
  });

  it("member side: date-aware fresh/stale prices, honest availability, explicit-only pet filters, outbound, favorites, trip attach", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const id = `p-${randomUUID().slice(0, 6)}`;
    const [ci, co, ci2, co2] = [iso(20), iso(23), iso(30), iso(33)];
    fixture.script = { listings: [listing(id, { petPolicy: { dogs: true, cats: "UNKNOWN" } as never })], prices: { [`${id}:${ci}:${co}:2`]: { priceIrr: 45_000_000, oldPriceIrr: 50_000_000, discountPercent: 10, priceBasis: "TOTAL_STAY", availability: "SOURCE_REPORTED_AVAILABLE" } } };
    await send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(201);
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: id } });

    const fresh = (await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci}&checkOut=${co}&guests=2`).expect(200)).body;
    expect(fresh.source).toMatchObject({ code: "FIXTURE" });
    expect(fresh.price).toMatchObject({ state: "FRESH", priceIrr: 45_000_000, discountPercent: 10, availability: { state: "SOURCE_REPORTED_AVAILABLE" } });
    expect(fresh.price.observedAt).toBeTruthy();
    // A different date range never reuses that price.
    expect((await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci2}&checkOut=${co2}&guests=2`).expect(200)).body.price).toMatchObject({ state: "NO_PRICE_FOR_DATES" });
    expect((await get(null, `/travel/external/stays/${stay.id}`).expect(200)).body.price).toEqual({ state: "DATES_REQUIRED" });
    await get(null, `/travel/external/stays/${stay.id}?checkIn=${co}&checkOut=${ci}`).expect(400);
    // Expired + source unreachable → STALE without a number.
    await db.externalStayPriceSnapshot.updateMany({ where: { stayId: stay.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    fixture.script.fail = new AdapterError("TIMEOUT", "slow");
    const stale = (await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci}&checkOut=${co}&guests=2`).expect(200)).body.price;
    expect(stale).toMatchObject({ state: "STALE", priceIrr: null, availability: { state: "UNKNOWN" } });
    fixture.script.fail = undefined;

    const search = (q: string) => get(null, `/travel/external/stays?city=${encodeURIComponent(city)}${q}`).expect(200).then((r) => r.body.items.map((i: { id: string }) => i.id));
    expect(await search("&dogs=true")).toContain(stay.id);
    expect(await search("&cats=true")).not.toContain(stay.id); // UNKNOWN never counts as yes
    expect(await search(`&checkIn=${ci}&checkOut=${co}&maxPrice=100000000`)).not.toContain(stay.id); // stale price never matches a price filter

    const out = await get(null, `/travel/external/stays/${stay.id}/out?checkIn=${ci}&guests=2`).expect(302);
    expect(out.headers.location).toBe(`https://www.fixture.example/stay/${id}`);
    expect(await db.outboundTravelClick.count({ where: { stayId: stay.id } })).toBe(1);
    expect(await db.booking.count({ where: { notes: { contains: id } } as never }).catch(() => 0)).toBe(0);

    const member = await actor("member");
    await send("post", member, `/me/external-stays/${stay.id}/favorite`).expect(201);
    const hh = await db.household.create({ data: { name: "h", members: { create: { userId: member.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Trip dog", species: "DOG", approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: member.id, canViewIdentity: true, canEditCareProfile: true } });
    const trip = await db.trip.create({ data: { householdId: hh.id, petId: pet.id, createdByUserId: member.id, originCountry: "IR", destinationCountry: "IR", destinationCity: city, departAt: new Date(ci), returnAt: new Date(co) } });
    const attached = (await send("post", member, `/pets/${pet.id}/trips/${trip.id}/external-stays`).send({ stayId: stay.id, checkIn: ci, checkOut: co, guests: 2 }).expect(201)).body;
    expect(attached[0]).toMatchObject({ state: "PLANNED_EXTERNAL_STAY", reservationConfirmed: false });
    // Another member's trip id under my pet path → 404 (no cross-pet read).
    const other = await db.trip.create({ data: { householdId: hh.id, petId: (await db.pet.create({ data: { householdId: hh.id, name: "Other", species: "CAT" } })).id, createdByUserId: member.id, originCountry: "IR", destinationCountry: "IR", departAt: new Date(ci) } });
    await get(member, `/pets/${pet.id}/trips/${other.id}/external-stays`).expect(404);

    // Hidden by staff: gone from members, favorite stays but marked unavailable.
    await send("post", root, `/admin/travel/external/listings/${stay.id}/visibility`).send({ action: "hide", reason: "owner complaint" }).expect(201);
    await get(null, `/travel/external/stays/${stay.id}/out`).expect(404);
    expect((await get(member, "/me/external-stays/favorites").expect(200)).body.find((f: { stay: { id: string } }) => f.stay.id === stay.id)).toMatchObject({ available: false });
  });

  it("staff manual records for blocked sources: allowlisted https only, evidence required, draft until published, audited", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ops = await actor("ops", AdminRole.OPERATIONS);
    const support = await actor("support", AdminRole.SUPPORT);
    await get(support, "/admin/travel/external/sources").expect(403);
    const sources = (await get(ops, "/admin/travel/external/sources").expect(200)).body;
    expect(sources.find((s: { code: string }) => s.code === "JABAMA")).toMatchObject({ mode: "MANUAL", automationStatus: "BLOCKED_EXTERNAL", health: "BLOCKED" });
    const base = { sourceCode: "JABAMA", title: "QA test villa (manual record)", city: "رامسر", petEvidenceType: "SOURCE_POLICY_TEXT", petEvidenceText: "متن صفحه‌ی منبع: پذیرش حیوان خانگی مجاز است (QA test)" };
    await send("post", ops, "/admin/travel/external/listings").send({ ...base, sourceUrl: "https://evil.example/stay/1" }).expect(400);
    await send("post", ops, "/admin/travel/external/listings").send({ ...base, sourceUrl: "javascript:alert(1)" }).expect(400);
    await send("post", ops, "/admin/travel/external/listings").send({ ...base, sourceUrl: "https://www.jabama.com/stay/qa-1", petEvidenceType: "AUTHORIZED_FEED" }).expect(400);
    const created = (await send("post", ops, "/admin/travel/external/listings").send({ ...base, sourceUrl: `https://www.jabama.com/stay/qa-${randomUUID().slice(0, 6)}` }).expect(201)).body;
    const inspect = (await get(ops, `/admin/travel/external/listings/${created.stayId}`).expect(200)).body;
    expect(inspect.normalized).toMatchObject({ publishState: "DRAFT", entryMode: "MANUAL" });
    expect(inspect.publishBlockers).toEqual([]);
    await get(null, `/travel/external/stays/${created.stayId}`).expect(404); // drafts are invisible
    await send("post", ops, `/admin/travel/external/listings/${created.stayId}/visibility`).send({ action: "publish", reason: "evidence checked on source page" }).expect(201);
    const price = (await send("post", ops, `/admin/travel/external/listings/${created.stayId}/prices`).send({ checkIn: iso(10), checkOut: iso(12), guests: 2, priceIrr: 30_000_000, priceBasis: "TOTAL_STAY", availability: "UNKNOWN", observedAt: new Date().toISOString() }).expect(201)).body;
    expect(price.observedBy).toBe("ADMIN");
    await send("post", ops, `/admin/travel/external/listings/${created.stayId}/override`).send({ field: "title", value: "ویلای آزمایشی" }).expect(403); // override.manage is admin-level
    const ov = (await send("post", root, `/admin/travel/external/listings/${created.stayId}/override`).send({ field: "title", value: "ویلای آزمایشی" }).expect(201)).body;
    expect(ov.title).toMatchObject({ sourceValue: base.title, overrideValue: "ویلای آزمایشی" });
    expect((await get(null, `/travel/external/stays/${created.stayId}`).expect(200)).body).toMatchObject({ title: "ویلای آزمایشی", source: { code: "JABAMA" } });
    await send("post", root, "/admin/travel/external/sources/JABAMA/pause").send({ reason: "testing pause" }).expect(201);
    await send("post", root, "/admin/travel/external/sources/JABAMA/resume").send({ reason: "testing resume" }).expect(201);
    expect(await db.adminAuditLog.count({ where: { OR: [{ entityId: created.stayId }, { entityId: "JABAMA" }], action: { startsWith: "travel_" } } })).toBeGreaterThanOrEqual(5);
    const dash = (await get(ops, "/admin/travel/external/dashboard").expect(200)).body;
    expect(dash).toMatchObject({ conversion: "UNKNOWN" });
  });
});
