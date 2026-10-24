import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TRAVEL_SOURCE_ADAPTERS } from "../src/modules/travel-external/adapters/adapter-registry";
import { FixtureAdapter, type FixturePayload } from "../src/modules/travel-external/adapters/fixture.adapter";
import { AdapterError } from "../src/modules/travel-external/adapters/travel-source-adapter";
import { TravelExternalService } from "../src/modules/travel-external/travel-external.service";

type Actor = { id: string; cookie: string; csrf: string };
const DAY = 86400e3;
const iso = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

/**
 * TRAVEL-SCRAPE engine contract. The FIXTURE adapter serves SYNTHETIC, labelled payloads (never real inventory) through
 * the real engine: success, unknown/confirmed pet policy, prices, removal, parser failure, anomaly, 403, 429, partial.
 */
describe("External pet-friendly stays", () => {
  let app: INestApplication, db: PrismaService, fixture: FixtureAdapter;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const city = `FixtureCity-${randomUUID().slice(0, 6)}`;
  const listing = (id: string, extra: Partial<FixturePayload> = {}): FixturePayload => ({ id, url: `https://www.fixture.example/stay/${id}`, title: `Fixture villa ${id} (synthetic)`, city, capacity: 6, amenities: ["استخر", "پذیرش حیوان خانگی"], images: [`https://img.fixture.example/${id}.jpg`, "https://evil.example/x.jpg"], ...extra });
  const run = (a: Actor, kind = "FULL") => send("post", a, "/admin/travel/external/sources/FIXTURE/runs").send({ kind }).expect(201).then((r) => r.body);
  const resetSource = () => db.externalTravelSource.update({ where: { code: "FIXTURE" }, data: { circuitOpenUntil: null, consecutiveFailures: 0, health: "HEALTHY" } });

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
    // Deterministic baseline per run (local DBs are reused): drop earlier FIXTURE inventory, runs and its tasks.
    await db.externalStay.deleteMany({ where: { source: { code: { in: ["FIXTURE", "FIXTURE2"] } } } });
    await db.externalSyncRun.deleteMany({ where: { source: { code: "FIXTURE" } } });
    await db.adminTask.deleteMany({ where: { source: "TRAVEL_SOURCE" } });
    await db.externalTravelSource.upsert({ where: { code: "FIXTURE" }, create: { code: "FIXTURE", nameFa: "منبع آزمایشی", nameEn: "Fixture source", allowedHosts: ["fixture.example"], mode: "AUTOMATED", automationStatus: "SUPPORTED", health: "HEALTHY", autoPublish: true, imagePolicy: "REMOTE_REFERENCE", priceTtlMinutes: 60, sourceType: "SCRAPED_PUBLIC_WEB", cityScopes: [city] }, update: { cityScopes: [city], mode: "AUTOMATED", automationStatus: "SUPPORTED", autoPublish: true, imagePolicy: "REMOTE_REFERENCE", circuitOpenUntil: null, consecutiveFailures: 0 } });
  });
  afterAll(async () => app.close());

  it("engine: UNKNOWN ingested (not rejected), evidence-only pet policy, idempotent, single-flight, field diffs, error isolation", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const a = `a-${randomUUID().slice(0, 6)}`, b = `b-${randomUUID().slice(0, 6)}`, c = `c-${randomUUID().slice(0, 6)}`, d = `d-${randomUUID().slice(0, 6)}`;
    fixture.script = { listings: [
      listing(a),
      // A villa with a garden whose review mentions a dog: still UNKNOWN (reviews are never policy).
      listing(b, { amenities: ["حیاط", "باربیکیو"], reviews: ["سگم خیلی اینجا را دوست داشت"] }),
      listing(c, { amenities: [], rules: "ورود حیوان خانگی به اقامتگاه ممنوع است." }),
      listing(d, { broken: true }),
    ] };
    await send("post", ro, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "FULL" }).expect(403);
    const run1 = await run(root);
    expect(run1).toMatchObject({ status: "PARTIAL", created: 3, failed: 1, listingsDiscovered: 4, trigger: "MANUAL", errorCategories: { PARSER_ERROR: 1 } });
    expect(run1.errors).toEqual([expect.objectContaining({ externalId: d, category: "PARSER_ERROR" })]);
    const byId = async (id: string) => db.externalStay.findFirstOrThrow({ where: { sourceListingId: id }, include: { images: true, petEvidence: true } });
    const sa = await byId(a);
    expect(sa).toMatchObject({ publishState: "PUBLISHED", status: "ACTIVE", petPolicyStatus: "CONFIRMED_ALLOWED", petFriendly: true, petEvidenceType: "SOURCE_AMENITY", sourceType: "SCRAPED_PUBLIC_WEB", entryMode: "AUTOMATED" });
    expect(sa.petEvidence[0]).toMatchObject({ status: "CONFIRMED_ALLOWED", authority: "SOURCE_OBSERVATION", evidenceText: "پذیرش حیوان خانگی", evidencePath: "amenities[1]" });
    expect(sa.images.map((i) => i.sourceImageUrl)).toEqual([`https://img.fixture.example/${a}.jpg`]); // off-allowlist image dropped
    expect(await byId(b)).toMatchObject({ petPolicyStatus: "UNKNOWN", petFriendly: false, petEvidenceText: null, publishState: "PUBLISHED" });
    expect(await byId(c)).toMatchObject({ petPolicyStatus: "CONFIRMED_NOT_ALLOWED", petFriendly: false });
    expect(await db.externalStayObservation.count({ where: { stayId: sa.id } })).toBe(1);

    // Same observation again: nothing new (no duplicate listing, snapshot or evidence row).
    fixture.script = { listings: [listing(a), listing(b, { amenities: ["حیاط", "باربیکیو"] }), listing(c, { amenities: [], rules: "ورود حیوان خانگی به اقامتگاه ممنوع است." })] };
    expect(await run(root)).toMatchObject({ status: "SUCCEEDED", created: 0, unchanged: 3 });
    expect(await db.externalStay.count({ where: { sourceListingId: a } })).toBe(1);
    expect(await db.externalStayObservation.count({ where: { stayId: sa.id } })).toBe(1);
    expect(await db.externalPetPolicyEvidence.count({ where: { stayId: sa.id } })).toBe(1);

    // Single flight: a concurrent run of the same source is refused.
    fixture.script.delayMs = 700;
    const [r1, r2] = await Promise.all([send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "DISCOVERY" }), send("post", root, "/admin/travel/external/sources/FIXTURE/runs").send({ kind: "DISCOVERY" })]);
    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    fixture.script.delayMs = 0;

    // Changes are recorded per field with old value, new value and the run.
    fixture.script.listings[0] = listing(a, { title: `Fixture villa ${a} renamed (synthetic)`, images: [`https://img.fixture.example/${a}-2.jpg`] });
    const run3 = await run(root);
    const changes = await db.externalStayChange.findMany({ where: { stayId: sa.id, runId: run3.id } });
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "FIELD_CHANGED", field: "title", oldValue: `Fixture villa ${a} (synthetic)`, newValue: `Fixture villa ${a} renamed (synthetic)` }), expect.objectContaining({ kind: "IMAGE_CHANGED", field: "imageUrls" })]));
    expect(await db.externalStayObservation.count({ where: { stayId: sa.id } })).toBe(2);
    expect((await get(ro, `/admin/travel/external/runs/${run3.id}`).expect(200)).body.changesByKind).toMatchObject({ FIELD_CHANGED: 1, IMAGE_CHANGED: 1 });
  });

  it("lifecycle: misses only count on complete healthy runs, STALE then REMOVED_FROM_SOURCE, reappears; parser anomaly withholds removals", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ids = Array.from({ length: 12 }, (_, i) => `l${i}-${randomUUID().slice(0, 5)}`);
    const all = ids.map((id) => listing(id, { amenities: [] }));
    fixture.script = { listings: all };
    await run(root);
    await run(root);
    const gone = ids[0]!;
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: gone } });
    // Incomplete discovery: never counts as a miss.
    fixture.script = { listings: all.slice(1), complete: false };
    await run(root);
    expect(await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).toMatchObject({ status: "ACTIVE", missedRuns: 0 });
    fixture.script = { listings: all.slice(1) };
    await run(root);
    expect(await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).toMatchObject({ status: "ACTIVE", missedRuns: 1 }); // one miss: still uncertain
    await run(root);
    expect((await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).status).toBe("STALE");
    expect((await get(null, `/travel/external/stays/${stay.id}`).expect(200)).body.status).toBe("STALE"); // last known data still served, labelled
    await run(root);
    await run(root);
    expect((await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).status).toBe("SOURCE_REMOVED");
    await get(null, `/travel/external/stays/${stay.id}`).expect(404);
    // It comes back → ACTIVE again with a REAPPEARED event; nothing was ever deleted.
    fixture.script = { listings: all };
    await run(root);
    expect(await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).toMatchObject({ status: "ACTIVE", missedRuns: 0 });
    expect(await db.externalStayChange.count({ where: { stayId: stay.id, kind: "REAPPEARED" } })).toBe(1);

    // Parser breaks (12 → 1): PARTIAL + anomaly, nobody goes stale, an admin task is raised once.
    fixture.script = { listings: all.slice(0, 1) };
    const bad = await run(root);
    expect(bad).toMatchObject({ status: "PARTIAL", anomaly: true });
    expect(await db.externalStay.count({ where: { sourceListingId: { in: ids }, missedRuns: { gt: 0 } } })).toBe(0);
    await run(root);
    expect(await db.adminTask.count({ where: { source: "TRAVEL_SOURCE", dedupeKey: { startsWith: "travel:FIXTURE:parser-anomaly:" } } })).toBe(1);
    const ph = (await get(root, "/admin/travel/external/parser-health").expect(200)).body.find((p: { code: string }) => p.code === "FIXTURE");
    expect(ph).toMatchObject({ parserReady: true, lastDiscovered: 1 });
    expect(ph.baselineListings).toBeGreaterThanOrEqual(11);
    expect(ph.anomalyRuns).toBeGreaterThanOrEqual(2);
  });

  it("blocks and rate limits: stop, no retry around them, circuit + tasks; inventory untouched; 429 honours Retry-After", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const id = `k-${randomUUID().slice(0, 6)}`;
    await resetSource();
    fixture.script = { listings: [listing(id)] };
    await run(root);
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: id } });
    fixture.script = { listings: [], fail: new AdapterError("BLOCKED_EXTERNAL", "fixture 403", 403) };
    expect((await run(root)).status).toBe("FAILED");
    const src = (await get(root, "/admin/travel/external/sources/FIXTURE").expect(200)).body;
    expect(src).toMatchObject({ health: "BLOCKED", status: "BLOCKED", accessStatus: "BLOCKED_BY_SOURCE", lastErrorCategory: "BLOCKED_EXTERNAL", partnership: "NONE" });
    expect(new Date(src.circuitOpenUntil).getTime()).toBeGreaterThan(Date.now() + 23 * 3600e3);
    expect(await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).toMatchObject({ status: "ACTIVE", publishState: "PUBLISHED" });
    expect((await run(root)).status).toBe("CANCELLED");
    expect(await db.adminTask.count({ where: { source: "TRAVEL_SOURCE", dedupeKey: { startsWith: "travel:FIXTURE:blocked:" } } })).toBe(1);
    await resetSource();
    fixture.script = { listings: [], fail: new AdapterError("RATE_LIMITED", "429", 429, 2 * 3600e3) };
    await run(root);
    const rl = await db.externalTravelSource.findUniqueOrThrow({ where: { code: "FIXTURE" } });
    expect(rl.circuitOpenUntil!.getTime()).toBeGreaterThan(Date.now() + 1.9 * 3600e3);
    expect(rl.health).toBe("DEGRADED");
    // Repeated failures → one REPEATED_FAILURE task.
    fixture.script = { listings: [], fail: new AdapterError("SOURCE_UNAVAILABLE", "HTTP 503", 503) };
    for (let i = 0; i < 3; i++) { await db.externalTravelSource.update({ where: { code: "FIXTURE" }, data: { circuitOpenUntil: null } }); await run(root); }
    expect(await db.adminTask.count({ where: { source: "TRAVEL_SOURCE", dedupeKey: { startsWith: "travel:FIXTURE:repeated-failure:" } } })).toBe(1);
    await resetSource();
    // Stuck runs never lock forever.
    const src0 = await db.externalTravelSource.findUniqueOrThrow({ where: { code: "FIXTURE" } });
    const stuck = await db.externalSyncRun.create({ data: { sourceId: src0.id, kind: "FULL", startedAt: new Date(Date.now() - 3 * 3600e3) } });
    await app.get(TravelExternalService).abandonStuckRuns();
    expect((await db.externalSyncRun.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("ABANDONED");
    const errs = (await get(root, "/admin/travel/external/errors?source=FIXTURE").expect(200)).body;
    expect(errs.items.length).toBeGreaterThan(0);
    const health = (await get(root, "/admin/system/health").expect(200)).body.components.travelScraper;
    expect(health.sources.find((s: { code: string }) => s.code === "FIXTURE")).toMatchObject({ mode: "AUTOMATED" });
  });

  it("pet policy truth: conflicting flips are traced + tasked; ADMIN_CONFIRMED wins over later source observations, which are kept", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ops = await actor("ops", AdminRole.OPERATIONS);
    const id = `pp-${randomUUID().slice(0, 6)}`;
    await resetSource();
    fixture.script = { listings: [listing(id, { amenities: [], rules: "پذیرش حیوان خانگی (سگ کوچک تا ۱۰ کیلو) مجاز است." })] };
    await run(root);
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: id } });
    expect((await db.externalPetPolicyEvidence.findFirstOrThrow({ where: { stayId: stay.id } }))).toMatchObject({ status: "CONFIRMED_ALLOWED", dogsAllowed: true, maxWeightKg: 10, evidencePath: "rules" });
    fixture.script = { listings: [listing(id, { amenities: [], rules: "ورود حیوان خانگی ممنوع است." })] };
    await run(root);
    expect(await db.externalStayChange.count({ where: { stayId: stay.id, kind: "PET_POLICY_CONFLICT" } })).toBe(1);
    expect(await db.adminTask.count({ where: { source: "TRAVEL_SOURCE", relatedEntityId: stay.id } })).toBe(1);
    const evidence = (await get(ops, `/admin/travel/external/pet-evidence?source=FIXTURE&status=CONFIRMED_NOT_ALLOWED`).expect(200)).body.items;
    expect(evidence.find((e: { stay: { id: string } }) => e.stay.id === stay.id)).toMatchObject({ authority: "SOURCE_OBSERVATION", evidenceText: expect.stringContaining("ممنوع") });
    // Staff verified with the property: allowed. Later source observations don't overwrite that.
    await send("post", ops, `/admin/travel/external/listings/${stay.id}/pet-policy`).send({ status: "CONFIRMED_ALLOWED", note: "called the host: small dogs ok" }).expect(201);
    await run(root);
    const after = (await get(ops, `/admin/travel/external/listings/${stay.id}`).expect(200)).body;
    expect(after.petPolicy).toMatchObject({ sourceObservation: "CONFIRMED_NOT_ALLOWED", adminConfirmed: "CONFIRMED_ALLOWED", effective: "CONFIRMED_ALLOWED" });
    expect(after.petEvidenceHistory.map((e: { authority: string }) => e.authority)).toEqual(expect.arrayContaining(["ADMIN_CONFIRMED", "SOURCE_OBSERVATION"]));
    const pub = (await get(null, `/travel/external/stays/${stay.id}`).expect(200)).body;
    expect(pub.pet).toMatchObject({ policyStatus: "CONFIRMED_ALLOWED", accepted: true, authority: "ADMIN_CONFIRMED" });
    expect(await db.adminAuditLog.count({ where: { entityId: stay.id, action: "travel_listing.pet_policy_reviewed" } })).toBe(1);
  });

  it("member side: provenance + disclaimer, contextual prices with freshness, FROM price, pet filters (UNKNOWN included by default), outbound, favorites, trip", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const id = `p-${randomUUID().slice(0, 6)}`, unknown = `u-${randomUUID().slice(0, 6)}`, no = `n-${randomUUID().slice(0, 6)}`;
    const [ci, co, ci2, co2] = [iso(20), iso(23), iso(30), iso(33)];
    await resetSource();
    const mcity = `${city}-m`; // own city: earlier tests' listings don't leak into these searches
    fixture.script = { listings: [listing(id, { city: mcity, rules: "پذیرش حیوان خانگی (فقط سگ) مجاز است.", prices: { [`${ci}:${co}:2`]: 45_000_000 }, fromPrice: 12_000_000, available: true }), listing(unknown, { city: mcity, amenities: [] }), listing(no, { city: mcity, amenities: [], rules: "حیوان خانگی مجاز نیست." })] };
    await run(root);
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: id } });

    const fresh = (await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci}&checkOut=${co}&guests=2`).expect(200)).body;
    expect(fresh.source).toMatchObject({ code: "FIXTURE", sourceType: "SCRAPED_PUBLIC_WEB", partnership: "NONE", affiliateStatus: "NONE", sourceUrl: `https://www.fixture.example/stay/${id}` });
    expect(fresh).toMatchObject({ cta: "VIEW_SOURCE", externalDataDisclaimerRequired: true, priceFreshness: "FRESH", availabilityStatus: "SOURCE_REPORTED_AVAILABLE", pet: { policyStatus: "CONFIRMED_ALLOWED", accepted: true } });
    expect(fresh.disclaimerFa).toContain("منبع عمومی");
    expect(fresh.lastSeenAt).toBeTruthy();
    expect(fresh.trustLabels).toEqual(expect.arrayContaining(["PET_POLICY_CONFIRMED", "PRICE_FRESH", "EXTERNAL_SOURCE"]));
    expect(fresh.price).toMatchObject({ state: "FRESH", freshness: "FRESH", priceType: "EXACT", currency: "IRR", priceIrr: 45_000_000, availability: { state: "SOURCE_REPORTED_AVAILABLE" } });
    expect(fresh.fromPrice).toMatchObject({ priceType: "FROM_PRICE", priceIrr: 12_000_000 }); // never presented as the booking price
    expect(fresh.price.observedAt).toBeTruthy();
    // 2 days old → AGING (number still shown, labelled); > 72 h → STALE without a number.
    await db.externalStayPriceSnapshot.updateMany({ where: { stayId: stay.id, priceType: "EXACT" }, data: { lastConfirmedAt: new Date(Date.now() - 48 * 3600e3) } });
    fixture.script.fail = new AdapterError("TIMEOUT", "source unreachable"); // no live refresh: the cached observation is what we have
    expect((await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci}&checkOut=${co}&guests=2`).expect(200)).body).toMatchObject({ priceFreshness: "AGING", price: { state: "FRESH", priceIrr: 45_000_000 }, trustLabels: expect.arrayContaining(["PRICE_AGING"]) });
    fixture.script.fail = undefined;
    // A different date range never reuses that price.
    expect((await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci2}&checkOut=${co2}&guests=2`).expect(200)).body.price).toMatchObject({ state: "NO_PRICE_FOR_DATES" });
    expect((await get(null, `/travel/external/stays/${stay.id}`).expect(200)).body.price).toEqual({ state: "DATES_REQUIRED", freshness: "UNKNOWN" });
    await get(null, `/travel/external/stays/${stay.id}?checkIn=${co}&checkOut=${ci}`).expect(400);
    // Old + source unreachable → STALE without a number.
    await db.externalStayPriceSnapshot.updateMany({ where: { stayId: stay.id }, data: { lastConfirmedAt: new Date(Date.now() - 80 * 3600e3), expiresAt: new Date(Date.now() - 1000) } });
    fixture.script.fail = new AdapterError("TIMEOUT", "slow");
    const stale = (await get(null, `/travel/external/stays/${stay.id}?checkIn=${ci}&checkOut=${co}&guests=2`).expect(200)).body.price;
    expect(stale).toMatchObject({ state: "STALE", priceIrr: null, availability: { state: "UNKNOWN" } });
    fixture.script.fail = undefined;

    const search = (q: string) => get(null, `/travel/external/stays?city=${encodeURIComponent(mcity)}${q}`).expect(200).then((r) => r.body.items.map((i: { id: string }) => i.id));
    const [su, sn] = await Promise.all([db.externalStay.findFirstOrThrow({ where: { sourceListingId: unknown } }), db.externalStay.findFirstOrThrow({ where: { sourceListingId: no } })]);
    const def = await search("");
    expect(def).toEqual(expect.arrayContaining([stay.id, su.id]));
    expect(def).not.toContain(sn.id); // explicit "no pets" is excluded by default
    expect(await search("&petPolicy=CONFIRMED_ALLOWED")).toEqual([stay.id]);
    expect(await search("&petPolicy=UNKNOWN")).toEqual([su.id]);
    expect(await search("&petPolicy=ANY")).toEqual(expect.arrayContaining([stay.id, su.id, sn.id]));
    expect((await get(null, `/travel/external/stays/${su.id}`).expect(200)).body).toMatchObject({ pet: { policyStatus: "UNKNOWN", accepted: "UNKNOWN" }, trustLabels: expect.arrayContaining(["PET_POLICY_UNKNOWN", "AVAILABILITY_UNKNOWN"]) });
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

  it("admin ERP: daily diff, metrics, duplicate candidates → staff-approved canonical accommodation, source tasks, real sources honest", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    await resetSource();
    const id = `dd-${randomUUID().slice(0, 6)}`;
    fixture.script = { listings: [listing(id, { title: "ویلای ساحلی آرامش (synthetic)", lat: 36.9, lng: 50.6 })] };
    await run(root);
    const stay = await db.externalStay.findFirstOrThrow({ where: { sourceListingId: id } });
    fixture.script = { listings: [listing(id, { title: "ویلای ساحلی آرامش (synthetic)", lat: 36.9, lng: 50.6, prices: { [`${iso(5)}:${iso(7)}:2`]: 20_000_000 } })] };
    await run(root);
    fixture.script = { listings: [listing(id, { title: "ویلای ساحلی آرامش (synthetic)", lat: 36.9, lng: 50.6, prices: { [`${iso(5)}:${iso(7)}:2`]: 22_000_000 } })] };
    await run(root);
    const diff = (await get(root, "/admin/travel/external/daily-diff?source=FIXTURE").expect(200)).body;
    expect(diff.newListings.map((n: { stayId: string }) => n.stayId)).toContain(stay.id);
    expect(diff.priceChanges.find((p: { stayId: string }) => p.stayId === stay.id)).toMatchObject({ oldValue: 20_000_000, newValue: 22_000_000 });
    expect(diff.runs.length).toBeGreaterThan(0);
    const m = (await get(root, "/admin/travel/external/metrics").expect(200)).body.find((x: { code: string }) => x.code === "FIXTURE");
    expect(m.listings).toBeGreaterThan(0);
    expect(m.petPolicy.petQualifiedPercent).not.toBeNull();
    expect(m.priceFreshness.FRESH).toBeGreaterThan(0);

    // A second source lists the same place: candidate only, never merged automatically.
    const other = await db.externalTravelSource.upsert({ where: { code: "FIXTURE2" }, create: { code: "FIXTURE2", nameFa: "منبع آزمایشی ۲", nameEn: "Fixture 2", allowedHosts: ["fixture.example"], mode: "MANUAL", automationStatus: "NOT_SUPPORTED" }, update: {} });
    const twin = await db.externalStay.create({ data: { sourceId: other.id, sourceListingId: `tw-${id}`, sourceUrl: `https://www.fixture.example/b/${id}`, title: "ویلای ساحلی آرامش (synthetic)", city, latitude: 36.9001, longitude: 50.6001, entryMode: "MANUAL", lastCheckedAt: new Date(), petPolicy: {} } });
    await app.get(TravelExternalService).findMatchCandidates(twin.id);
    const cands = (await get(root, "/admin/travel/external/matches").expect(200)).body.filter((x: { stayAId: string; stayBId: string }) => [x.stayAId, x.stayBId].includes(stay.id));
    expect(cands).toHaveLength(1);
    expect((await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).canonicalAccommodationId).toBeNull();
    expect(await db.adminTask.count({ where: { source: "TRAVEL_SOURCE", dedupeKey: { startsWith: "travel:duplicates:" } } })).toBeGreaterThanOrEqual(1);
    await send("post", root, `/admin/travel/external/matches/${cands[0].id}/approve`).expect(201);
    const canon = (await db.externalStay.findUniqueOrThrow({ where: { id: stay.id } })).canonicalAccommodationId!;
    expect(canon).toBeTruthy();
    expect((await get(root, `/admin/travel/external/canonical/${canon}`).expect(200)).body.listings).toHaveLength(2);
    expect((await get(root, "/admin/travel/external/tasks").expect(200)).body.length).toBeGreaterThan(0);

    // Real sources: no partnership, Alibaba's parser is pending (not a source block), a run fails without a failure streak.
    const sources = (await get(root, "/admin/travel/external/sources").expect(200)).body;
    expect(sources.find((s: { code: string }) => s.code === "ALIBABA")).toMatchObject({ sourceType: "UNOFFICIAL_PUBLIC_WEB_ENDPOINT", accessStatus: "TOOL_PERMISSION_BLOCKED", status: "NOT_SUPPORTED", partnership: "NONE", affiliateStatus: "NONE", adapter: { parserReady: false } });
    const ali = (await send("post", root, "/admin/travel/external/sources/ALIBABA/runs").send({ kind: "FULL" }).expect(201)).body;
    expect(ali).toMatchObject({ status: "FAILED", errorCategories: { PARSER_PENDING: 1 }, pagesRequested: 0 });
    expect((await db.externalTravelSource.findUniqueOrThrow({ where: { code: "ALIBABA" } })).consecutiveFailures).toBe(0);
  });

  it("staff manual records for blocked sources: allowlisted https only, evidence required, draft until published, audited", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ops = await actor("ops", AdminRole.OPERATIONS);
    const support = await actor("support", AdminRole.SUPPORT);
    await get(support, "/admin/travel/external/sources").expect(403);
    const sources = (await get(ops, "/admin/travel/external/sources").expect(200)).body;
    expect(sources.find((s: { code: string }) => s.code === "JABAMA")).toMatchObject({ mode: "MANUAL", automationStatus: "NOT_SUPPORTED" });
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
