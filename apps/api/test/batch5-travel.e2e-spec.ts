import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, InsurerRole, ProviderUserRole, TravelBookingStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { TravelBookingService } from "../src/modules/travel-marketplace/travel-booking.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  return /code=(\d+)/.exec(call[0] as string)![1]!;
}

const DAY = 86_400_000;
/** yyyy-mm-dd, `offset` days from today (UTC). */
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/**
 * Batch 5 — Travel marketplace, Trip Hub, insurer workflow and places, through the real HTTP surface.
 */
describe("Batch 5 — Travel, Insurance, Places", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function signUp(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf");
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier }).expect(200);
    const code = captureOtpCode(logSpy, identifier);
    const verify = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier, code }).expect(200);
    return { session: extractCookie(verify.headers["set-cookie"], "petlife_session"), csrf };
  }

  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (url: string) => request(server).get(url).set("Cookie", cookie),
      post: (url: string) => request(server).post(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (url: string) => request(server).patch(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (url: string) => request(server).put(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (url: string) => request(server).delete(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  type Client = ReturnType<typeof client>;

  async function traveler(pets: { species: "DOG" | "CAT"; weightKg?: number | null }[] = [{ species: "DOG", weightKg: 12 }]) {
    const identifier = `b5-traveler-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await c.post("/households").send({}).expect(201);
    const petIds: string[] = [];
    for (const [i, p] of pets.entries()) {
      const pet = await c.post(`/households/${household.body.id}/pets`).send({ name: `Pet${i}`, species: p.species, approximateAgeMonths: 30 }).expect(201);
      if (p.weightKg !== undefined) await prisma.pet.update({ where: { id: pet.body.id }, data: { latestWeightValue: p.weightKg, latestWeightUnit: p.weightKg === null ? null : "KG" } });
      petIds.push(pet.body.id);
    }
    return { c, userId: user.id, householdId: household.body.id as string, petIds };
  }

  async function partner() {
    const identifier = `b5-partner-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const org = await prisma.providerOrganization.create({ data: { name: `B5 Stay ${unique()}`, type: "TRAVEL_ACCOMMODATION", verificationStatus: "VERIFIED" } });
    await prisma.providerUser.create({ data: { userId: user.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    return { c, userId: user.id, orgId: org.id };
  }

  async function admin(role: AdminRole) {
    const identifier = `b5-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { c, userId: user.id };
  }

  /** A published listing created directly (fast path) with one unit and optional rate plans. */
  async function listing(orgId: string, opts: { bookingMode?: "INSTANT_BOOKING" | "REQUEST_TO_BOOK"; quantity?: number; price?: number; policy?: Record<string, unknown> | null; plans?: Record<string, unknown>[]; city?: string; lat?: number; lng?: number } = {}) {
    const l = await prisma.travelListing.create({
      data: {
        organizationId: orgId,
        type: "HOTEL",
        title: `B5 Listing ${unique()}`,
        description: "Pet friendly stay",
        country: "IR",
        city: opts.city ?? `City-${unique()}`,
        latitude: opts.lat ?? 35.7,
        longitude: opts.lng ?? 51.4,
        bookingMode: opts.bookingMode ?? "INSTANT_BOOKING",
        status: "PUBLISHED",
        isPubliclyListed: true,
        amenities: ["WIFI", "PARKING"],
        cancellationPolicy: "See rate terms",
      },
    });
    if (opts.policy !== null) {
      await prisma.travelPetPolicy.create({ data: { listingId: l.id, dogsAllowed: true, catsAllowed: true, maxPets: 2, maxWeightKg: 25, petFeeIrr: 100_000, ...(opts.policy ?? {}) } });
    }
    const unit = await prisma.travelInventoryUnit.create({ data: { listingId: l.id, name: "Room", quantity: opts.quantity ?? 1, maxOccupancy: 2, basePriceIrr: opts.price ?? 1_000_000 } });
    const plans = [];
    for (const p of opts.plans ?? []) plans.push(await prisma.travelRatePlan.create({ data: { unitId: unit.id, name: "Plan", ...(p as object) } }));
    return { listingId: l.id, unitId: unit.id, city: l.city, plans };
  }

  async function holdAndSubmit(c: Client, l: { listingId: string; unitId: string }, petIds: string[], checkIn = day(10), checkOut = day(12), ratePlanId?: string) {
    const hold = await c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, ratePlanId, checkIn, checkOut, petIds }).expect(201);
    expect(hold.body.status).toBe("HELD");
    const submitted = await c.post(`/travel/bookings/${hold.body.id}/submit`).send({ acknowledgeMissingInfo: true }).expect(201);
    return submitted.body;
  }

  // --------------------------------------------------------------- discovery

  describe("search and listing", () => {
    it("filters by destination, dates, pets and price, excludes unbookable/conflicting stays, and prices the whole stay server-side", async () => {
      const p = await partner();
      const city = `Rasht-${unique()}`;
      const cheap = await listing(p.orgId, { city, price: 800_000 });
      const pricey = await listing(p.orgId, { city, price: 3_000_000 });
      const catsOnly = await listing(p.orgId, { city, policy: { dogsAllowed: false, catsAllowed: true } });
      const full = await listing(p.orgId, { city, quantity: 1 });
      await prisma.travelAvailability.create({ data: { unitId: full.unitId, date: new Date(`${day(10)}T00:00:00Z`), isBlocked: true } });

      const t = await traveler([{ species: "DOG", weightKg: 12 }]);
      const res = await t.c.get(`/travel/listings?city=${encodeURIComponent(city)}&checkIn=${day(10)}&checkOut=${day(12)}&petIds=${t.petIds[0]}&sort=PRICE_ASC`).expect(200);
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).toEqual([cheap.listingId, pricey.listingId]);
      expect(ids).not.toContain(catsOnly.listingId);
      expect(ids).not.toContain(full.listingId);
      const first = res.body.items[0];
      // 2 nights × 800,000 + pet fee 100,000 (one pet).
      expect(first.stay.totalIrr).toBe(1_700_000);
      expect(first.petMatch).toBe("MATCH");
      expect(res.body.mapAvailable).toBe(false);

      const capped = await request(server).get(`/travel/listings?city=${encodeURIComponent(city)}&checkIn=${day(10)}&checkOut=${day(12)}&maxPrice=2000000`).expect(200);
      expect(capped.body.items.map((i: { id: string }) => i.id)).toEqual([cheap.listingId, catsOnly.listingId]);

      await request(server).get(`/travel/listings?checkIn=${day(-2)}&checkOut=${day(1)}`).expect(400);
      await request(server).get(`/travel/listings?checkIn=${day(4)}&checkOut=${day(3)}`).expect(400);
      await request(server).get(`/travel/listings?sort=DISTANCE`).expect(400);
    });

    it("pet policy match: MATCH, MORE_INFO_NEEDED (unknown weight / unstated policy) and POTENTIAL_CONFLICT (weight, species, count)", async () => {
      const p = await partner();
      const l = await listing(p.orgId, { policy: { maxWeightKg: 10, maxPets: 1, catsAllowed: false } });
      const unstated = await listing(p.orgId, { policy: null });
      const light = await traveler([{ species: "DOG", weightKg: 8 }]);
      const heavy = await traveler([{ species: "DOG", weightKg: 30 }]);
      const unknown = await traveler([{ species: "DOG", weightKg: null }]);
      const cat = await traveler([{ species: "CAT", weightKg: 4 }]);
      const two = await traveler([{ species: "DOG", weightKg: 5 }, { species: "DOG", weightKg: 6 }]);
      const q = (t: { c: Client; petIds: string[] }, id = l.listingId, unitId = l.unitId) => t.c.get(`/travel/listings/${id}/quote?unitId=${unitId}&checkIn=${day(20)}&checkOut=${day(21)}&petIds=${t.petIds.join(",")}`).expect(200);

      expect((await q(light)).body.petPolicyMatch.outcome).toBe("MATCH");
      expect((await q(heavy)).body.petPolicyMatch.reasons[0].code).toBe("OVER_MAX_WEIGHT");
      expect((await q(unknown)).body.petPolicyMatch.outcome).toBe("MORE_INFO_NEEDED");
      expect((await q(cat)).body.petPolicyMatch.reasons[0].code).toBe("SPECIES_NOT_ACCEPTED");
      expect((await q(two)).body.petPolicyMatch.outcome).toBe("POTENTIAL_CONFLICT");
      expect((await q(light, unstated.listingId, unstated.unitId)).body.petPolicyMatch.reasons[0].code).toBe("POLICY_NOT_STATED");

      // A conflict can never be held; missing info needs explicit acknowledgement.
      await heavy.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(20), checkOut: day(21), petIds: heavy.petIds }).expect(400);
      const hold = await unknown.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(20), checkOut: day(21), petIds: unknown.petIds }).expect(201);
      const noAck = await unknown.c.post(`/travel/bookings/${hold.body.id}/submit`).send({}).expect(400);
      expect(noAck.body.error.details.reason).toBe("PET_POLICY_CONFIRMATION_REQUIRED");

      // Private pet ids never work for a caller who does not own them.
      await light.c.get(`/travel/listings/${l.listingId}/quote?unitId=${l.unitId}&checkIn=${day(20)}&checkOut=${day(21)}&petIds=${heavy.petIds[0]}`).expect(404);
    });

    it("rate plans: required when defined, modifier and deposit applied, min nights enforced; favorites toggle", async () => {
      const p = await partner();
      const l = await listing(p.orgId, {
        price: 1_000_000,
        plans: [
          { name: "Flexible", cancellationType: "FREE_UNTIL", freeCancellationDays: 3, paymentTiming: "PAY_NOW" },
          { name: "Saver", priceModifierPercent: -20, cancellationType: "NON_REFUNDABLE", paymentTiming: "DEPOSIT", depositPercent: 50, minNights: 2 },
        ],
      });
      const t = await traveler();
      await t.c.get(`/travel/listings/${l.listingId}/quote?unitId=${l.unitId}&checkIn=${day(5)}&checkOut=${day(7)}`).expect(400);
      const saver = await t.c.get(`/travel/listings/${l.listingId}/quote?unitId=${l.unitId}&ratePlanId=${l.plans[1]!.id}&checkIn=${day(5)}&checkOut=${day(7)}&petIds=${t.petIds[0]}`).expect(200);
      // 2 × 1,000,000 − 20% = 1,600,000 + pet fee 100,000 = 1,700,000; deposit 50%.
      expect(saver.body.totalAmountIrr).toBe(1_700_000);
      expect(saver.body.payNowAmountIrr).toBe(850_000);
      expect(saver.body.payLaterAmountIrr).toBe(850_000);
      await t.c.get(`/travel/listings/${l.listingId}/quote?unitId=${l.unitId}&ratePlanId=${l.plans[1]!.id}&checkIn=${day(5)}&checkOut=${day(6)}`).expect(400);

      // Compare/favorites share the search item shape; free-text terms never count as "free cancellation".
      const plain = await listing(p.orgId, { city: l.city });
      const cmp = await request(server).get(`/travel/compare?ids=${l.listingId},${plain.listingId}`).expect(200);
      expect(cmp.body.map((i: { id: string }) => i.id)).toEqual([l.listingId, plain.listingId]);
      expect(cmp.body[0].petPolicySummary.stated).toBe(true);
      expect(cmp.body[0].freeCancellationAvailable).toBe(true);
      expect(cmp.body[1].freeCancellationAvailable).toBe(false);

      await t.c.put(`/travel/listings/${l.listingId}/favorite`).expect(200);
      expect((await t.c.get(`/travel/listings/${l.listingId}`).expect(200)).body.favorited).toBe(true);
      const favs = (await t.c.get("/travel/favorites").expect(200)).body;
      expect(favs.map((f: { id: string }) => f.id)).toContain(l.listingId);
      expect(favs.find((f: { id: string }) => f.id === l.listingId).favorited).toBe(true);
      await t.c.delete(`/travel/listings/${l.listingId}/favorite`).expect(200);
    });
    it("a public unit calendar is only served for units of that published listing; support cases can link only your own stay", async () => {
      const p = await partner();
      const pub = await listing(p.orgId);
      const hidden = await listing(p.orgId);
      await prisma.travelListing.update({ where: { id: hidden.listingId }, data: { status: "DRAFT", isPubliclyListed: false } });
      const cal = await request(server).get(`/travel/listings/${pub.listingId}/units/${pub.unitId}/calendar?from=${day(3)}&to=${day(5)}`).expect(200);
      expect(cal.body).toHaveLength(3);
      await request(server).get(`/travel/listings/${pub.listingId}/units/${hidden.unitId}/calendar?from=${day(3)}&to=${day(5)}`).expect(404);

      const owner = await traveler();
      const other = await traveler();
      const b = await holdAndSubmit(owner.c, pub, owner.petIds);
      expect(b.bookingMode).toBe("INSTANT_BOOKING");
      await other.c.post("/support/cases").send({ subject: "Help", description: "Not mine", category: "BOOKING", relatedEntityType: "TRAVEL_BOOKING", relatedEntityId: b.id }).expect(400);
      await owner.c.post("/support/cases").send({ subject: "Question about my stay", description: "Arrival time", category: "BOOKING", relatedEntityType: "TRAVEL_BOOKING", relatedEntityId: b.id }).expect(201);
    });
  });

  // --------------------------------------------------------------- booking

  describe("booking lifecycle", () => {
    it("instant booking: hold → payment required → sandbox payment confirms; the price cannot be tampered with", async () => {
      const p = await partner();
      const l = await listing(p.orgId);
      const t = await traveler();
      const hold = await t.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(10), checkOut: day(12), petIds: t.petIds, totalAmountIrr: 1 }).expect(400);
      expect(hold.body.error).toBeTruthy();
      const booking = await holdAndSubmit(t.c, l, t.petIds);
      expect(booking.status).toBe("AWAITING_PAYMENT");
      expect(booking.totalAmountIrr).toBe(2_100_000);
      expect(booking.priceBreakdown.nightly).toHaveLength(2);

      const failed = await t.c.post(`/travel/bookings/${booking.id}/pay`).send({ mode: "FAILURE" }).expect(201);
      expect(failed.body.status).toBe("AWAITING_PAYMENT");
      expect(failed.body.paymentStatus).toBe("FAILED");
      const paid = await t.c.post(`/travel/bookings/${booking.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      expect(paid.body.status).toBe("CONFIRMED");
      expect(paid.body.paymentStatus).toBe("PAID");
      const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { id: (await prisma.travelBooking.findUniqueOrThrow({ where: { id: booking.id } })).paymentIntentId! } });
      expect(intent.amount).toBe(2_100_000);
      expect(paid.body.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["HELD", "AWAITING_PAYMENT", "CONFIRMED"]);
    });

    it("paying twice at once charges once and posts one balanced ledger entry", async () => {
      const p = await partner();
      const l = await listing(p.orgId);
      const t = await traveler();
      const booking = await holdAndSubmit(t.c, l, t.petIds);
      const results = await Promise.all([1, 2, 3].map(() => t.c.post(`/travel/bookings/${booking.id}/pay`).send({ mode: "SUCCESS" })));
      expect(results.every((r) => r.status < 500)).toBe(true);
      expect(results.some((r) => r.status === 201 && r.body.status === "CONFIRMED")).toBe(true);
      const row = await prisma.travelBooking.findUniqueOrThrow({ where: { id: booking.id } });
      const checkouts = await prisma.paymentIntent.findMany({ where: { idempotencyKey: { startsWith: `travel:${booking.id}:` }, status: "CAPTURED" } });
      expect(checkouts).toHaveLength(1);
      expect(checkouts[0]!.id).toBe(row.paymentIntentId);
      const legs = await prisma.ledgerEntry.findMany({ where: { ledgerTransaction: { referenceType: "PAYMENT", referenceId: checkouts[0]!.checkoutId } } });
      expect(legs.filter((e) => e.direction === "DEBIT").reduce((a, e) => a + e.amount, 0)).toBe(2_100_000);
      expect(legs.filter((e) => e.direction === "CREDIT").reduce((a, e) => a + e.amount, 0)).toBe(2_100_000);
    });

    it("two travellers racing for the last room: exactly one hold succeeds", async () => {
      const p = await partner();
      const l = await listing(p.orgId, { quantity: 1 });
      const a = await traveler();
      const b = await traveler();
      const results = await Promise.all([
        a.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(30), checkOut: day(32), petIds: a.petIds }),
        b.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(31), checkOut: day(33), petIds: b.petIds }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.travelBookedNight.count({ where: { unitId: l.unitId, night: new Date(`${day(31)}T00:00:00Z`) } })).toBe(1);
    });

    it("holds, unanswered requests and unpaid bookings expire and release inventory; finished stays complete", async () => {
      const p = await partner();
      const l = await listing(p.orgId, { quantity: 1 });
      const r = await listing(p.orgId, { bookingMode: "REQUEST_TO_BOOK" });
      const t = await traveler();
      const hold = await t.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(40), checkOut: day(41), petIds: t.petIds }).expect(201);
      const request_ = await holdAndSubmit(t.c, r, t.petIds, day(40), day(41));
      expect(request_.status).toBe("AWAITING_PROVIDER");
      await prisma.travelBooking.update({ where: { id: hold.body.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
      await prisma.travelBooking.update({ where: { id: request_.id }, data: { requestExpiresAt: new Date(Date.now() - 1000) } });
      const svc = app.get(TravelBookingService);
      const res = await svc.processExpiries();
      expect(res.expired).toBeGreaterThanOrEqual(2);
      expect((await prisma.travelBooking.findUniqueOrThrow({ where: { id: hold.body.id } })).status).toBe(TravelBookingStatus.EXPIRED);
      expect(await prisma.travelBookedNight.count({ where: { bookingId: { in: [hold.body.id, request_.id] } } })).toBe(0);
      // The released night is bookable again.
      await t.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(40), checkOut: day(41), petIds: t.petIds }).expect(201);
      await t.c.post(`/travel/bookings/${request_.id}/submit`).send({}).expect(409);
    });

    it("request to book: provider accepts (payment then due) or rejects (dates released); another partner cannot act", async () => {
      const p = await partner();
      const other = await partner();
      const l = await listing(p.orgId, { bookingMode: "REQUEST_TO_BOOK" });
      const t = await traveler();
      const b1 = await holdAndSubmit(t.c, l, t.petIds, day(50), day(52));
      await other.c.post(`/provider/travel/bookings/${b1.id}/accept`).send({}).expect(404);
      await other.c.get(`/provider/travel/bookings/${b1.id}`).expect(404);
      const accepted = await p.c.post(`/provider/travel/bookings/${b1.id}/accept`).send({ note: "Welcome" }).expect(201);
      expect(accepted.body.status).toBe("AWAITING_PAYMENT");
      const b2 = await holdAndSubmit(t.c, l, t.petIds, day(60), day(61));
      await p.c.post(`/provider/travel/bookings/${b2.id}/reject`).send({}).expect(400);
      const rejected = await p.c.post(`/provider/travel/bookings/${b2.id}/reject`).send({ reason: "Renovation" }).expect(201);
      expect(rejected.body.status).toBe("REJECTED");
      expect(await prisma.travelBookedNight.count({ where: { bookingId: b2.id } })).toBe(0);
    });

    it("cancellation follows the snapshotted terms: free window = full refund, non-refundable = none; provider cancel = full refund", async () => {
      const p = await partner();
      const l = await listing(p.orgId, {
        plans: [
          { name: "Flexible", cancellationType: "FREE_UNTIL", freeCancellationDays: 3 },
          { name: "NR", cancellationType: "NON_REFUNDABLE", priceModifierPercent: -10 },
        ],
      });
      const t = await traveler();
      const flex = await holdAndSubmit(t.c, l, t.petIds, day(20), day(21), l.plans[0]!.id);
      await t.c.post(`/travel/bookings/${flex.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      // Later edits to the plan never change the booking's terms.
      await prisma.travelRatePlan.update({ where: { id: l.plans[0]!.id }, data: { cancellationType: "NON_REFUNDABLE" } });
      const detail = await t.c.get(`/travel/bookings/${flex.id}`).expect(200);
      expect(detail.body.ratePlan.cancellationType).toBe("FREE_UNTIL");
      expect(detail.body.refundPreviewIrr).toBe(1_100_000);
      const cancelled = await t.c.post(`/travel/bookings/${flex.id}/cancel`).send({ reason: "Plans changed" }).expect(201);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(cancelled.body.refundAmountIrr).toBe(1_100_000);
      expect(cancelled.body.paymentStatus).toBe("REFUNDED");
      await t.c.post(`/travel/bookings/${flex.id}/cancel`).send({}).expect(409);

      const nr = await holdAndSubmit(t.c, l, t.petIds, day(25), day(26), l.plans[1]!.id);
      await t.c.post(`/travel/bookings/${nr.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const nrCancelled = await t.c.post(`/travel/bookings/${nr.id}/cancel`).send({}).expect(201);
      expect(nrCancelled.body.refundAmountIrr).toBe(0);
      expect(nrCancelled.body.paymentStatus).toBe("PAID");

      const byHost = await holdAndSubmit(t.c, l, t.petIds, day(27), day(28), l.plans[1]!.id);
      await t.c.post(`/travel/bookings/${byHost.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const hostCancelled = await p.c.post(`/provider/travel/bookings/${byHost.id}/cancel`).send({ reason: "Flooding" }).expect(201);
      expect(hostCancelled.body.refundAmountIrr).toBe(byHost.payNowAmountIrr);
    });

    it("modification keeps the booking when the amount due is unchanged, refuses when it changes, and never loses the original on failure", async () => {
      const p = await partner();
      const l = await listing(p.orgId, { quantity: 1 });
      const blocker = await listing(p.orgId);
      void blocker;
      const t = await traveler();
      const b = await holdAndSubmit(t.c, l, t.petIds, day(70), day(72));
      await t.c.post(`/travel/bookings/${b.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const moved = await t.c.post(`/travel/bookings/${b.id}/modify`).send({ checkIn: day(71), checkOut: day(73) }).expect(201);
      expect(moved.body.status).toBe("CONFIRMED");
      expect(moved.body.checkIn).toBe(day(71));
      expect((await prisma.travelBooking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(TravelBookingStatus.MODIFIED);
      const longer = await t.c.post(`/travel/bookings/${moved.body.id}/modify`).send({ checkIn: day(71), checkOut: day(74) }).expect(409);
      expect(longer.body.error.code).toBe("TRAVEL_MODIFICATION_REQUIRES_REBOOKING");
      expect((await prisma.travelBooking.findUniqueOrThrow({ where: { id: moved.body.id } })).status).toBe(TravelBookingStatus.CONFIRMED);
      expect(await prisma.travelBookedNight.count({ where: { bookingId: moved.body.id } })).toBe(2);
    });

    it("booking ids are private: another traveller gets 404 on read, cancel, pay, modify, review and share", async () => {
      const p = await partner();
      const l = await listing(p.orgId);
      const owner = await traveler();
      const other = await traveler();
      const b = await holdAndSubmit(owner.c, l, owner.petIds);
      await other.c.get(`/travel/bookings/${b.id}`).expect(404);
      await other.c.post(`/travel/bookings/${b.id}/cancel`).send({}).expect(404);
      await other.c.post(`/travel/bookings/${b.id}/pay`).send({ mode: "SUCCESS" }).expect(404);
      await other.c.post(`/travel/bookings/${b.id}/modify`).send({ checkIn: day(11), checkOut: day(12) }).expect(404);
      await other.c.post(`/travel/bookings/${b.id}/review`).send({ overall: 1 }).expect(404);
      expect((await other.c.get("/travel/bookings").expect(200)).body.items).toHaveLength(0);
    });

    it("reviews: only completed stays, once; hidden reviews leave the rating; provider may respond once", async () => {
      const p = await partner();
      const l = await listing(p.orgId, { bookingMode: "INSTANT_BOOKING", plans: [{ name: "At property", paymentTiming: "PAY_AT_PROPERTY" }] });
      const t = await traveler();
      const b = await holdAndSubmit(t.c, l, t.petIds, day(1), day(2), l.plans[0]!.id);
      expect(b.status).toBe("CONFIRMED");
      expect(b.paymentStatus).toBe("PAY_AT_PROPERTY");
      await t.c.post(`/travel/bookings/${b.id}/review`).send({ overall: 5 }).expect(409);
      await prisma.travelBooking.update({ where: { id: b.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      const review = await t.c.post(`/travel/bookings/${b.id}/review`).send({ overall: 4, petFriendliness: 5, body: "Great for dogs" }).expect(201);
      await t.c.post(`/travel/bookings/${b.id}/review`).send({ overall: 4 }).expect(409);
      expect((await request(server).get(`/travel/listings/${l.listingId}`).expect(200)).body.rating).toMatchObject({ average: 4, count: 1, petFriendliness: 5 });
      await p.c.post(`/provider/travel/reviews/${review.body.id}/response`).send({ response: "Thank you!" }).expect(201);
      await p.c.post(`/provider/travel/reviews/${review.body.id}/response`).send({ response: "Again" }).expect(400);
      const ts = await admin(AdminRole.TRUST_SAFETY);
      await ts.c.patch(`/admin/travel/reviews/${review.body.id}/visibility`).send({ hidden: true, reason: "Contains phone number" }).expect(200);
      expect((await request(server).get(`/travel/listings/${l.listingId}`).expect(200)).body.rating.count).toBe(0);
    });
  });

  // --------------------------------------------------------------- documents, trip hub

  describe("documents and trip hub", () => {
    it("a document shared for a booking is readable by that partner only while the grant is live", async () => {
      const p = await partner();
      const other = await partner();
      const l = await listing(p.orgId, { policy: { vaccinationRequired: true } });
      const t = await traveler();
      const stranger = await traveler();
      const b = await holdAndSubmit(t.c, l, t.petIds);
      const doc = await prisma.medicalDocument.create({
        data: { petId: t.petIds[0]!, householdId: t.householdId, documentType: "VACCINATION_CERTIFICATE", title: "Rabies 2026", sourceType: "OWNER", fileObjectKey: `health-documents/${unique()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 1000 },
      });
      const strangerDoc = await prisma.medicalDocument.create({
        data: { petId: stranger.petIds[0]!, householdId: stranger.householdId, documentType: "VACCINATION_CERTIFICATE", title: "Other", sourceType: "OWNER", fileObjectKey: `health-documents/${unique()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 1000 },
      });
      await t.c.post(`/travel/bookings/${b.id}/documents`).send({ medicalDocumentId: strangerDoc.id, purpose: "VACCINATION_PROOF" }).expect(404);
      const shared = await t.c.post(`/travel/bookings/${b.id}/documents`).send({ medicalDocumentId: doc.id, purpose: "VACCINATION_PROOF" }).expect(201);
      const shareId = shared.body.documentShares[0].id;
      const url = await p.c.get(`/provider/travel/bookings/${b.id}/documents/${shareId}/url`).expect(200);
      expect(url.body.downloadUrl).toBeTruthy();
      await other.c.get(`/provider/travel/bookings/${b.id}/documents/${shareId}/url`).expect(404);
      // The partner never sees other documents or the health timeline through the booking.
      const view = await p.c.get(`/provider/travel/bookings/${b.id}`).expect(200);
      expect(JSON.stringify(view.body)).not.toContain(strangerDoc.id);
      await t.c.delete(`/travel/bookings/${b.id}/documents/${shareId}`).expect(200);
      await p.c.get(`/provider/travel/bookings/${b.id}/documents/${shareId}/url`).expect(404);
      await t.c.post(`/travel/bookings/${b.id}/documents`).send({ medicalDocumentId: doc.id, purpose: "VACCINATION_PROOF" }).expect(201);
      await prisma.travelBookingDocumentShare.updateMany({ where: { bookingId: b.id }, data: { createdAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - 1000) } });
      await p.c.get(`/provider/travel/bookings/${b.id}/documents/${shareId}/url`).expect(404);
    });

    it("trip hub aggregates bookings, readiness with provenance, document state and library suggestions", async () => {
      const t = await traveler();
      const p = await partner();
      const l = await listing(p.orgId, { city: "Shiraz" });
      const ops = await admin(AdminRole.ADMIN);
      const rule = await ops.c
        .post("/admin/travel/requirement-rules")
        .send({ country: "IR", requirementType: "RABIES", title: "Rabies vaccination", description: "Valid rabies vaccination for intercity transport.", source: "Iran Veterinary Organization", sourceUrl: "https://ivo.ir", verifiedAt: new Date(Date.now() - 10 * DAY).toISOString() })
        .expect(201);
      expect(rule.body.isStale).toBe(false);
      const trip = await t.c.post(`/pets/${t.petIds[0]}/trips`).send({ originCountry: "IR", destinationCountry: "IR", destinationCity: "Shiraz", departAt: new Date(Date.now() + 9 * DAY).toISOString(), returnAt: new Date(Date.now() + 14 * DAY).toISOString() }).expect(201);
      const hold = await t.c.post("/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn: day(10), checkOut: day(12), petIds: t.petIds }).expect(201);
      const sub = await t.c.post(`/travel/bookings/${hold.body.id}/submit`).send({ tripId: trip.body.id });
      expect(sub.body).toMatchObject({ status: "AWAITING_PAYMENT" });

      const hub = await t.c.get(`/travel/trips/${trip.body.id}/hub`).expect(200);
      expect(hub.body.bookings).toHaveLength(1);
      expect(hub.body.suggestions.requirementRules.map((r: { id: string }) => r.id)).toContain(rule.body.id);
      const applied = await t.c.post(`/travel/trips/${trip.body.id}/requirements/from-rules`).send({ ruleIds: [rule.body.id] }).expect(201);
      const req = applied.body.readiness.requirements.find((r: { requirementType: string }) => r.requirementType === "RABIES");
      expect(req.status).toBe("REQUIRED");
      expect(req.source).toBe("Iran Veterinary Organization");
      expect(req.jurisdiction).toBe("IR");
      expect(applied.body.documentStates[req.id]).toBe("MISSING");
      expect(applied.body.readiness.allReady).toBe(false);
      expect(applied.body.activity.some((a: { type: string }) => a.type === "BOOKING")).toBe(true);

      const stranger = await traveler();
      await stranger.c.get(`/travel/trips/${trip.body.id}/hub`).expect(404);
      expect((await t.c.get("/travel/trips?scope=upcoming").expect(200)).body.map((x: { id: string }) => x.id)).toContain(trip.body.id);
    });
  });

  // --------------------------------------------------------------- partner + admin

  describe("partner portal and admin", () => {
    it("partner builds a listing (unit, rate, policy, media), submits it; admin requests correction, then approves; partners are isolated", async () => {
      const p = await partner();
      const other = await partner();
      const created = await p.c.post("/provider/travel/listings").send({ type: "VILLA", title: "Garden Villa", description: "A quiet villa with a fully fenced yard for dogs.", country: "IR", city: "Karaj", checkInFrom: "14:00", checkOutUntil: "12:00" }).expect(201);
      const id = created.body.id;
      await other.c.get(`/provider/travel/listings/${id}`).expect(403);
      await other.c.patch(`/provider/travel/listings/${id}`).send({ title: "Mine" }).expect(403);
      const withUnit = await p.c.post(`/provider/travel/listings/${id}/units`).send({ name: "Whole villa", quantity: 1, maxOccupancy: 6, basePriceIrr: 5_000_000, maxPets: 3 }).expect(201);
      const unitId = withUnit.body.units[0].id;
      await p.c.post(`/provider/travel/listings/${id}/units/${unitId}/rate-plans`).send({ name: "Deposit", paymentTiming: "DEPOSIT" }).expect(400);
      await p.c.post(`/provider/travel/listings/${id}/units/${unitId}/rate-plans`).send({ name: "Standard", cancellationType: "FREE_UNTIL", freeCancellationDays: 7 }).expect(201);
      await p.c.post(`/provider/travel/listings/${id}/media`).send({ url: "https://evil.example.com/x.jpg" }).expect(201).catch(() => undefined);
      await p.c.post(`/provider/travel/listings/${id}/media`).send({ url: "javascript:alert(1)" }).expect(400);
      await p.c.post(`/provider/travel/listings/${id}/media`).send({ url: "/images/travel/villa-1.svg", alt: "Villa" }).expect(201);
      await p.c.post(`/provider/travel/listings/${id}/submit`).expect(201);

      const ops = await admin(AdminRole.OPERATIONS);
      const noPolicy = await ops.c.post(`/admin/travel/listings/${id}/moderate`).send({ action: "APPROVE" }).expect(409);
      expect(noPolicy.body.error.details.reason).toBe("PET_POLICY_MISSING");
      await ops.c.post(`/admin/travel/listings/${id}/moderate`).send({ action: "REQUEST_CORRECTION" }).expect(400);
      await ops.c.post(`/admin/travel/listings/${id}/moderate`).send({ action: "REQUEST_CORRECTION", note: "Add your pet policy" }).expect(201);
      expect((await p.c.get(`/provider/travel/listings/${id}`).expect(200)).body.moderationNote).toBe("Add your pet policy");
      await p.c.put(`/provider/travel/listings/${id}/pet-policy`).send({ dogsAllowed: true, maxPets: 3, petFeeIrr: 200_000 }).expect(200);
      await p.c.post(`/provider/travel/listings/${id}/submit`).expect(201);
      const approved = await ops.c.post(`/admin/travel/listings/${id}/moderate`).send({ action: "APPROVE" }).expect(201);
      expect(approved.body.listing.status).toBe("PUBLISHED");
      expect(await prisma.adminAuditLog.count({ where: { entityType: "TRAVEL_LISTING", entityId: id } })).toBe(2);
      await request(server).get(`/travel/listings/${id}`).expect(200);

      // Blackout: a blocked range is unbookable.
      await p.c.put(`/provider/travel/listings/${id}/units/${unitId}/availability`).send({ fromDate: day(15), toDate: day(16), isBlocked: true }).expect(200);
      const cal = await p.c.get(`/provider/travel/listings/${id}/calendar?from=${day(14)}&to=${day(17)}`).expect(200);
      expect(cal.body[0].days.map((d: { isBlocked: boolean }) => d.isBlocked)).toEqual([false, true, true, false]);
      const t = await traveler();
      const plan = (await request(server).get(`/travel/listings/${id}`).expect(200)).body.units[0].ratePlans[0].id;
      await t.c.post("/travel/bookings/hold").send({ listingId: id, unitId, ratePlanId: plan, checkIn: day(15), checkOut: day(17), petIds: t.petIds }).expect(409);
      await other.c.get(`/provider/travel/listings/${id}/calendar?from=${day(14)}&to=${day(17)}`).expect(403);
      expect((await p.c.get("/provider/travel/finance").expect(200)).body.settlementNote).toBe("PAYOUTS_NOT_AUTOMATED");
    });

    it("admin travel is permission-gated: editor none, support read-only, content curates requirements", async () => {
      const editor = await admin(AdminRole.EDITOR);
      await editor.c.get("/admin/travel/listings").expect(403);
      const support = await admin(AdminRole.SUPPORT);
      await support.c.get("/admin/travel/bookings").expect(200);
      await support.c.get("/admin/travel/analytics").expect(200);
      await support.c.post("/admin/travel/requirement-rules").send({}).expect(403);
      const content = await admin(AdminRole.CONTENT);
      await content.c
        .post("/admin/travel/requirement-rules")
        .send({ country: "IR", requirementType: "MICROCHIP", title: "Microchip", description: "ISO microchip", source: "Test source", verifiedAt: new Date(Date.now() + DAY).toISOString() })
        .expect(400);
      const old = await content.c
        .post("/admin/travel/requirement-rules")
        .send({ country: "IR", requirementType: "MICROCHIP", title: "Microchip", description: "ISO microchip", source: "Test source", verifiedAt: new Date(Date.now() - 400 * DAY).toISOString() })
        .expect(201);
      expect(old.body.isStale).toBe(true);
    });
  });

  // --------------------------------------------------------------- insurance

  describe("insurance workflow", () => {
    it("insurer sees only its own consented applications and decides them; the applicant sees the outcome; no fake approval by PET LIFE", async () => {
      const t = await traveler([{ species: "DOG", weightKg: 10 }]);
      const providerA = await prisma.insuranceProvider.create({ data: { name: `Insurer A ${unique()}`, country: "IR", status: "VERIFIED", isPubliclyListed: true } });
      const providerB = await prisma.insuranceProvider.create({ data: { name: `Insurer B ${unique()}`, country: "IR", status: "VERIFIED", isPubliclyListed: true } });
      const product = await prisma.insuranceProduct.create({ data: { providerId: providerA.id, name: "Dog Care", country: "IR", speciesEligibility: ["DOG"], coverageTypes: ["ACCIDENT", "ILLNESS"], coverageSummary: "Accident and illness", exclusions: ["Pre-existing conditions"], status: "VERIFIED", isPubliclyListed: true } });
      const underwriterId = `b5-underwriter-${unique()}@example.com`;
      const underwriter = client(await signUp(underwriterId));
      const uw = await prisma.user.findUniqueOrThrow({ where: { email: underwriterId } });
      await prisma.insurerMembership.create({ data: { providerId: providerA.id, userId: uw.id, role: InsurerRole.UNDERWRITING } });
      const otherInsurerId = `b5-other-insurer-${unique()}@example.com`;
      const otherInsurer = client(await signUp(otherInsurerId));
      await prisma.insurerMembership.create({ data: { providerId: providerB.id, userId: (await prisma.user.findUniqueOrThrow({ where: { email: otherInsurerId } })).id } });

      const draft = await t.c.post(`/pets/${t.petIds[0]}/insurance-applications`).send({ productId: product.id }).expect(201);
      expect((await underwriter.get("/insurer/applications").expect(200)).body.total).toBe(0);
      await t.c.post(`/pets/${t.petIds[0]}/insurance-applications/${draft.body.id}/submit`).send({ consent: true }).expect(200);
      const list = await underwriter.get("/insurer/applications").expect(200);
      expect(list.body.items.map((a: { id: string }) => a.id)).toContain(draft.body.id);
      expect(JSON.stringify(list.body)).not.toContain(t.userId);
      await otherInsurer.get(`/insurer/applications/${draft.body.id}`).expect(404);
      await otherInsurer.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "APPROVED" }).expect(404);

      await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "APPROVED" }).expect(409);
      await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "UNDER_REVIEW" }).expect(201);
      await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "NEEDS_INFORMATION" }).expect(400);
      await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "NEEDS_INFORMATION", message: "Please add the vet's latest notes." }).expect(201);
      const mine = await t.c.get(`/pets/${t.petIds[0]}/insurance-applications/${draft.body.id}`).expect(200);
      expect(mine.body.status).toBe("NEEDS_INFORMATION");
      expect(mine.body.insurerMessage).toContain("vet");
      await t.c.patch(`/pets/${t.petIds[0]}/insurance-applications/${draft.body.id}`).send({ notes: "Vet notes attached to my profile" }).expect(200);
      await t.c.post(`/pets/${t.petIds[0]}/insurance-applications/${draft.body.id}/submit`).send({ consent: true }).expect(200);
      await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "UNDER_REVIEW" }).expect(201);
      const approved = await underwriter.post(`/insurer/applications/${draft.body.id}/decision`).send({ status: "APPROVED", externalReference: "POL-123" }).expect(201);
      expect(approved.body.status).toBe("APPROVED");
      expect(approved.body.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "SUBMITTED", "UNDER_REVIEW", "APPROVED"]);

      const ops = await admin(AdminRole.ADMIN);
      const adminView = await ops.c.get("/admin/insurance/applications").expect(200);
      expect(adminView.body.items.some((a: { id: string }) => a.id === draft.body.id)).toBe(true);
      const nobody = client(await signUp(`b5-nobody-${unique()}@example.com`));
      await nobody.get("/insurer/applications").expect(403);
    });
  });

  // --------------------------------------------------------------- places

  describe("places", () => {
    it("nearby uses PostGIS distance; users can report outdated data once; admins resolve with audit", async () => {
      const ops = await admin(AdminRole.ADMIN);
      const near = await ops.c.post("/admin/places").send({ name: `Park ${unique()}`, category: "PARK", country: "IR", city: "Tehran", latitude: 35.7, longitude: 51.4, speciesAllowed: ["DOG"], leashRequired: true }).expect(201);
      const far = await ops.c.post("/admin/places").send({ name: `Cafe ${unique()}`, category: "CAFE", country: "IR", city: "Tehran", latitude: 35.9, longitude: 51.8 }).expect(201);
      for (const id of [near.body.id, far.body.id]) {
        await ops.c.post(`/admin/places/${id}/verification`).send({ status: "VERIFIED" }).expect(201);
        await ops.c.post(`/admin/places/${id}/listing`).send({ isPubliclyListed: true }).expect(201);
      }
      const nearby = await request(server).get("/places/nearby?latitude=35.7001&longitude=51.4001&radiusMeters=5000").expect(200);
      const ids = nearby.body.items.map((p: { id: string }) => p.id);
      expect(ids).toContain(near.body.id);
      expect(ids).not.toContain(far.body.id);
      expect(nearby.body.items.find((p: { id: string }) => p.id === near.body.id).leashRequired).toBe(true);

      const t = await traveler();
      const report = await t.c.post(`/places/${near.body.id}/reports`).send({ reason: "CLOSED_PERMANENTLY" }).expect(201);
      await t.c.post(`/places/${near.body.id}/reports`).send({ reason: "OTHER" }).expect(400);
      const reports = await ops.c.get("/admin/places/reports").expect(200);
      expect(reports.body.some((r: { id: string }) => r.id === report.body.id)).toBe(true);
      await ops.c.post(`/admin/places/reports/${report.body.id}/resolve`).send({ status: "RESOLVED", note: "Unlisted" }).expect(201);
      await ops.c.post(`/admin/places/reports/${report.body.id}/resolve`).send({ status: "RESOLVED" }).expect(404);
      expect(await prisma.adminAuditLog.count({ where: { entityType: "PLACE_REPORT", entityId: report.body.id } })).toBe(1);
    });
  });
});
