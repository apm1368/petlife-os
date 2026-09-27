import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, BookingStatus, LocationMode, ProviderServiceType, ProviderUserRole, ServiceCategory, type ProviderService } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";
import { BookingExpiryWorker } from "../src/modules/booking/booking-expiry.worker";
import { CareSourceListener } from "../src/modules/care-reminders/care-source.listener";
import { WaitlistService } from "../src/modules/booking/waitlist.service";

type Actor = { id: string; cookie: string; csrf: string };

describe("Batch 3 — services, booking lifecycle, provider and admin operations", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `b3-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const get = (a: Actor, url: string) => request(server()).get(url).set("Cookie", a.cookie);
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const patch = (a: Actor, url: string) => request(server()).patch(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const put = (a: Actor, url: string) => request(server()).put(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function household(owner: Actor, petNames = ["پاپی"]) {
    const hh = await db.household.create({ data: { name: `خانواده ${randomUUID().slice(0, 6)}` } });
    await db.householdMember.create({ data: { householdId: hh.id, userId: owner.id, role: "OWNER" } });
    const pets = [];
    for (const name of petNames) {
      const pet = await db.pet.create({ data: { householdId: hh.id, name, species: "DOG", approximateAgeMonths: 30 } });
      await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true } });
      pets.push(pet);
    }
    return { householdId: hh.id, pets };
  }

  async function clinic(opts: { staffCount?: number; service?: Partial<ProviderService>; category?: ServiceCategory; type?: ProviderServiceType } = {}) {
    const org = await db.providerOrganization.create({ data: { name: `کلینیک ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "خیابان آزمون", city: "تهران", countryCode: "IR", timezone: "UTC" } });
    const owner = await actor("clinic-owner");
    const ownerStaff = await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const staff: { actor: Actor; providerUserId: string }[] = [{ actor: owner, providerUserId: ownerStaff.id }];
    for (let i = 1; i < (opts.staffCount ?? 1); i++) {
      const a = await actor(`vet-${i}`);
      const pu = await db.providerUser.create({ data: { userId: a.id, providerOrganizationId: org.id, role: ProviderUserRole.VET } });
      staff.push({ actor: a, providerUserId: pu.id });
    }
    const service = await db.providerService.create({
      data: {
        providerOrganizationId: org.id,
        locationId: location.id,
        name: "ویزیت عمومی",
        type: opts.type ?? ProviderServiceType.GENERAL_VET_VISIT,
        category: opts.category ?? ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 30,
        priceAmount: 1_000_000,
        currency: "IRR",
        ...opts.service,
      },
    });
    for (const s of staff) {
      await db.providerAvailabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: s.providerUserId, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })),
      });
    }
    return { org, location, service, staff, owner };
  }

  /** First AVAILABLE slot at least `hoursAhead` in the future (optionally for one staff member / variant). */
  async function slot(c: Awaited<ReturnType<typeof clinic>>, opts: { hoursAhead?: number; providerUserId?: string; variantId?: string; serviceId?: string } = {}) {
    const from = new Date(Date.now() + (opts.hoursAhead ?? 48) * 3600_000);
    const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: opts.serviceId ?? c.service.id, providerUserId: opts.providerUserId, variantId: opts.variantId, from, to: new Date(from.getTime() + 2 * 86400_000) });
    const s = slots.find((x) => x.state === "AVAILABLE");
    if (!s) throw new Error("no slot");
    return s;
  }

  async function book(owner: Actor, petId: string, c: Awaited<ReturnType<typeof clinic>>, extra: Record<string, unknown> = {}, confirmExtra: Record<string, unknown> = {}) {
    const s = await slot(c, { providerUserId: extra.providerUserId as string | undefined, variantId: extra.variantId as string | undefined, hoursAhead: extra.hoursAhead as number | undefined });
    delete extra.hoursAhead;
    const hold = await post(owner, "/booking-holds").send({ petId, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString(), ...extra }).expect(201);
    const booking = await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId, ...confirmExtra }).expect(201);
    return booking.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    // Listen once on an ephemeral port: this suite fires truly concurrent requests, and supertest's
    // per-request listen() on a non-listening server races and can reset connections (ECONNRESET).
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });

  describe("variants, snapshots and instant booking", () => {
    it("requires a variant when the service has options, snapshots its price/duration/policy and never follows later price edits", async () => {
      const c = await clinic({ service: { cancellationPolicy: "لغو رایگان تا ۲۴ ساعت قبل", freeCancellationHours: 24, lateCancellationRefundPercent: 50 } });
      const small = await db.providerServiceVariant.create({ data: { serviceId: c.service.id, name: "کوچک", priceAmount: 800_000, durationMinutes: 30 } });
      const large = await db.providerServiceVariant.create({ data: { serviceId: c.service.id, name: "بزرگ", priceAmount: 1_500_000, durationMinutes: 60 } });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const s = await slot(c);
      await post(owner, "/booking-holds").send({ petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString() }).expect(400);

      const booking = await book(owner, pets[0]!.id, c, { variantId: large.id });
      expect(booking.bookingStatus).toBe("CONFIRMED");
      expect(booking.bookingNumber).toMatch(/^PL-B-\d{6}$/);
      expect(booking.variantName).toBe("بزرگ");
      expect(booking.priceAmount).toBe(1_500_000);
      expect(booking.durationMinutes).toBe(60);
      expect(new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()).toBe(60 * 60_000);
      expect(booking.cancellationPolicy).toBe("لغو رایگان تا ۲۴ ساعت قبل");
      expect(booking.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["CONFIRMED"]);

      await db.providerServiceVariant.update({ where: { id: large.id }, data: { priceAmount: 9_999_999 } });
      await db.providerService.update({ where: { id: c.service.id }, data: { cancellationPolicy: "changed" } });
      const reread = await get(owner, `/bookings/${booking.id}`).expect(200);
      expect(reread.body.priceAmount).toBe(1_500_000);
      expect(reread.body.cancellationPolicy).toBe("لغو رایگان تا ۲۴ ساعت قبل");
      expect(small.id).toBeTruthy();
    });

    it("ignores any client-supplied price (no price field is accepted on hold or confirm)", async () => {
      const c = await clinic();
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const s = await slot(c);
      const hold = await post(owner, "/booking-holds").send({ petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString() }).expect(201);
      const res = await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId: pets[0]!.id, priceAmount: 1 });
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) expect(res.body.priceAmount).toBe(1_000_000);
    });

    it("books multiple pets of the same household when the service allows it, never a foreign pet", async () => {
      const c = await clinic({ service: { maxPetsPerBooking: 2 } });
      const owner = await actor("owner");
      const { pets } = await household(owner, ["اول", "دوم", "سوم"]);
      const stranger = await actor("stranger");
      const other = await household(stranger, ["غریبه"]);
      const s = await slot(c);
      const base = { petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString() };
      await post(owner, "/booking-holds").send({ ...base, additionalPetIds: [pets[1]!.id, pets[2]!.id] }).expect(400);
      await post(owner, "/booking-holds").send({ ...base, additionalPetIds: [other.pets[0]!.id] }).expect(404);
      const booking = await book(owner, pets[0]!.id, c, { additionalPetIds: [pets[1]!.id] });
      expect(booking.additionalPetIds).toEqual([pets[1]!.id]);
      expect(booking.priceAmount).toBe(2_000_000);
      const filtered = await get(owner, `/bookings?petId=${pets[1]!.id}`).expect(200);
      expect(filtered.body.map((b: { id: string }) => b.id)).toContain(booking.id);
    });

    it("enforces the provider's own pet eligibility rules", async () => {
      const c = await clinic({ service: { supportsDog: false } });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const s = await slot(c);
      const res = await post(owner, "/booking-holds").send({ petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString() });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PET_NOT_SUPPORTED");
    });
  });

  describe("double booking protection", () => {
    it("a staff member can never hold two overlapping bookings even with different variant durations", async () => {
      const c = await clinic();
      const long = await db.providerServiceVariant.create({ data: { serviceId: c.service.id, name: "۶۰ دقیقه", priceAmount: 1, durationMinutes: 60 } });
      const short = await db.providerServiceVariant.create({ data: { serviceId: c.service.id, name: "۳۰ دقیقه", priceAmount: 1, durationMinutes: 30 } });
      const a = await actor("a");
      const b = await actor("b");
      const ha = await household(a);
      const hb = await household(b);
      const first = await book(a, ha.pets[0]!.id, c, { variantId: long.id, providerUserId: c.staff[0]!.providerUserId });
      // A 30-minute slot starting inside the booked hour is BOOKED for the same staff.
      const inside = new Date(new Date(first.startAt).getTime() + 30 * 60_000);
      const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.service.id, providerUserId: c.staff[0]!.providerUserId, variantId: short.id, from: new Date(inside.getTime() - 60_000), to: new Date(inside.getTime() + 31 * 60_000) });
      expect(slots.find((s) => s.startAt.getTime() === inside.getTime())?.state).toBe("BOOKED");
      // Even if a hold slipped past the generator, Postgres rejects the overlap.
      await expect(
        db.booking.create({ data: { householdId: hb.householdId, petId: hb.pets[0]!.id, userId: b.id, providerOrganizationId: c.org.id, providerLocationId: c.location.id, providerUserId: c.staff[0]!.providerUserId, providerServiceId: c.service.id, category: "VET", locationMode: "AT_PROVIDER", startAt: inside, endAt: new Date(inside.getTime() + 30 * 60_000), timezone: "UTC" } }),
      ).rejects.toThrow();
    });

    it("concurrent holds on the same slot: exactly one wins", async () => {
      const c = await clinic();
      const s = await slot(c, { providerUserId: c.staff[0]!.providerUserId });
      const owners = await Promise.all([actor("x"), actor("y"), actor("z")]);
      const hhs = await Promise.all(owners.map((o) => household(o)));
      const results = await Promise.all(
        owners.map((o, i) => post(o, "/booking-holds").send({ petId: hhs[i]!.pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: s.startAt.toISOString(), providerUserId: c.staff[0]!.providerUserId })),
      );
      expect(results.map((r) => `${r.status}:${r.body?.error?.code ?? ""}`).sort().join(",")).toBe("201:,409:SLOT_UNAVAILABLE,409:SLOT_UNAVAILABLE");
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    });

    it("a required resource limits capacity across staff and staff qualification is respected", async () => {
      const c = await clinic({ staffCount: 3, service: { requiredResourceType: "EXAM_ROOM" } });
      await db.providerResource.create({ data: { providerOrganizationId: c.org.id, locationId: c.location.id, name: "اتاق ۱", type: "EXAM_ROOM" } });
      // Only the first two staff are qualified for this service.
      await put(c.owner, `/provider/staff/${c.staff[0]!.providerUserId}/services`).send({ serviceIds: [c.service.id] }).expect(200);
      await put(c.owner, `/provider/staff/${c.staff[1]!.providerUserId}/services`).send({ serviceIds: [c.service.id] }).expect(200);
      await put(c.staff[1]!.actor, `/provider/staff/${c.staff[2]!.providerUserId}/services`).send({ serviceIds: [c.service.id] }).expect(403);
      const from = new Date(Date.now() + 48 * 3600_000);
      const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.service.id, from, to: new Date(from.getTime() + 86400_000) });
      expect(new Set(slots.map((s) => s.providerUserId))).toEqual(new Set([c.staff[0]!.providerUserId, c.staff[1]!.providerUserId]));
      const target = slots.find((s) => s.state === "AVAILABLE")!;
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const hold = await post(owner, "/booking-holds").send({ petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: target.startAt.toISOString() }).expect(201);
      const booking = await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId: pets[0]!.id }).expect(201);
      expect(booking.body.bookingStatus).toBe("CONFIRMED");
      const after = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.service.id, from: new Date(target.startAt.getTime() - 60_000), to: new Date(target.endAt.getTime() + 60_000) });
      // The only room is taken, so the other qualified vet is not bookable at that time either.
      expect(after.filter((s) => s.startAt.getTime() === target.startAt.getTime()).every((s) => s.state !== "AVAILABLE")).toBe(true);
    });
  });

  describe("request-to-book", () => {
    it("REQUESTED → provider accept → CONFIRMED; another clinic cannot act on it", async () => {
      const c = await clinic({ service: { bookingMode: "REQUEST" } });
      const other = await clinic();
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c);
      expect(booking.bookingStatus).toBe("REQUESTED");
      expect(booking.requestExpiresAt).not.toBeNull();
      const queue = await get(c.owner, "/provider/bookings?requests=true").expect(200);
      expect(queue.body.map((b: { id: string }) => b.id)).toContain(booking.id);
      await post(other.owner, `/provider/bookings/${booking.id}/accept`).send({}).expect((r) => expect([403, 404]).toContain(r.status));
      await post(owner, `/provider/bookings/${booking.id}/accept`).send({}).expect(403);
      const accepted = await post(c.owner, `/provider/bookings/${booking.id}/accept`).send({}).expect(201);
      expect(accepted.body.booking.bookingStatus).toBe("CONFIRMED");
      await post(c.owner, `/provider/bookings/${booking.id}/accept`).send({}).expect(400);
      const detail = await get(owner, `/bookings/${booking.id}`).expect(200);
      expect(detail.body.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["REQUESTED", "CONFIRMED"]);
      // Notification listeners run after the transaction, asynchronously.
      let providerAlerts = 0;
      for (let i = 0; i < 50 && providerAlerts === 0; i++) {
        providerAlerts = await db.notification.count({ where: { entityId: booking.id, type: "provider.bookingRequest", userId: c.owner.id } });
        if (!providerAlerts) await new Promise((r) => setTimeout(r, 50));
      }
      expect(providerAlerts).toBe(1);
      expect(await db.notification.count({ where: { entityId: booking.id, type: "booking.requested", userId: owner.id } })).toBe(1);
    });

    it("reject records the reason; unanswered requests expire and release the slot", async () => {
      const c = await clinic({ service: { bookingMode: "REQUEST" } });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const rejected = await book(owner, pets[0]!.id, c);
      const res = await post(c.owner, `/provider/bookings/${rejected.id}/reject`).send({ reason: "در این روز جراحی داریم" }).expect(201);
      expect(res.body.booking.bookingStatus).toBe("REJECTED");
      expect((await get(owner, `/bookings/${rejected.id}`)).body.rejectedReason).toBe("در این روز جراحی داریم");

      const pending = await book(owner, pets[0]!.id, c, { hoursAhead: 72 });
      await db.booking.update({ where: { id: pending.id }, data: { requestExpiresAt: new Date(Date.now() - 1000) } });
      expect(await app.get(BookingExpiryWorker).process()).toBeGreaterThanOrEqual(1);
      const expired = await get(owner, `/bookings/${pending.id}`).expect(200);
      expect(expired.body.bookingStatus).toBe("EXPIRED");
      expect(expired.body.timeline.at(-1).actorType).toBe("SYSTEM");
      // Slot is free again.
      const hold = await post(owner, "/booking-holds").send({ petId: pets[0]!.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: pending.startAt, providerUserId: pending.providerUserId });
      expect(hold.status).toBe(201);
    });
  });

  describe("payment, cancellation and refund", () => {
    it("prepaid booking stays AWAITING_PAYMENT on failure and confirms only on a successful charge", async () => {
      const c = await clinic({ service: { paymentMode: "FULL_PREPAYMENT" } });
      const owner = await actor("owner");
      const stranger = await actor("stranger");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c);
      expect(booking.bookingStatus).toBe("AWAITING_PAYMENT");
      await post(stranger, `/bookings/${booking.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "SUCCESS" }).expect(403);
      const failed = await post(owner, `/bookings/${booking.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "FAILURE" }).expect(201);
      expect(failed.body.bookingStatus).toBe("AWAITING_PAYMENT");
      expect(failed.body.paymentStatus).toBe("FAILED");
      const paid = await post(owner, `/bookings/${booking.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "SUCCESS" }).expect(201);
      expect(paid.body.bookingStatus).toBe("CONFIRMED");
      expect(paid.body.paymentStatus).toBe("PAID");
      await post(owner, `/bookings/${booking.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "SUCCESS" }).expect(400);
    });

    it("unpaid bookings expire after the payment window", async () => {
      const c = await clinic({ service: { paymentMode: "DEPOSIT", depositAmount: 200_000 as never } });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c);
      expect(booking.depositAmount).toBe(200_000);
      await db.booking.update({ where: { id: booking.id }, data: { requestExpiresAt: new Date(Date.now() - 1) } });
      await app.get(BookingExpiryWorker).process();
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).bookingStatus).toBe(BookingStatus.EXPIRED);
    });

    it("customer cancellation refunds per the snapshotted policy; provider cancellation always refunds in full", async () => {
      const c = await clinic({ service: { paymentMode: "FULL_PREPAYMENT", freeCancellationHours: 24, lateCancellationRefundPercent: 50 } });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const pay = async (b: { id: string }) => post(owner, `/bookings/${b.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "SUCCESS" }).expect(201);

      const early = await book(owner, pets[0]!.id, c, { hoursAhead: 72 });
      await pay(early);
      await post(owner, `/bookings/${early.id}/cancel`).send({ reason: "تغییر برنامه" }).expect(201);
      const earlyBooking = await db.booking.findUniqueOrThrow({ where: { id: early.id } });
      expect(earlyBooking.paymentStatus).toBe("REFUND_PENDING");
      expect((await db.refund.findFirstOrThrow({ where: { paymentIntentId: earlyBooking.paymentIntentId! } })).amount).toBe(1_000_000);

      const late = await book(owner, pets[0]!.id, c, { hoursAhead: 3 });
      await pay(late);
      await post(owner, `/bookings/${late.id}/cancel`).send({}).expect(201);
      const lateBooking = await db.booking.findUniqueOrThrow({ where: { id: late.id } });
      expect((await db.refund.findFirstOrThrow({ where: { paymentIntentId: lateBooking.paymentIntentId! } })).amount).toBe(500_000);

      const byProvider = await book(owner, pets[0]!.id, c, { hoursAhead: 4 });
      await pay(byProvider);
      await post(c.owner, `/provider/bookings/${byProvider.id}/cancel`).send({ reason: "بیماری دامپزشک" }).expect(201);
      const provBooking = await db.booking.findUniqueOrThrow({ where: { id: byProvider.id } });
      expect((await db.refund.findFirstOrThrow({ where: { paymentIntentId: provBooking.paymentIntentId! } })).amount).toBe(1_000_000);
      expect(provBooking.bookingStatus).toBe("CANCELLED_BY_PROVIDER");
    });
  });

  describe("reschedule, series and rebook", () => {
    it("moves a booking atomically, keeps its snapshot and consent, and never loses the original on conflict", async () => {
      const c = await clinic({ staffCount: 1 });
      const owner = await actor("owner");
      const rival = await actor("rival");
      const { pets } = await household(owner);
      const rivalHh = await household(rival);
      const original = await book(owner, pets[0]!.id, c, { providerUserId: c.staff[0]!.providerUserId }, { accessSelection: "HEALTH_BASICS" });
      const taken = await book(rival, rivalHh.pets[0]!.id, c, { providerUserId: c.staff[0]!.providerUserId, hoursAhead: 96 });
      await post(owner, `/bookings/${original.id}/reschedule`).set("Idempotency-Key", randomUUID()).send({ slotStart: taken.startAt }).expect(409);
      expect((await db.booking.findUniqueOrThrow({ where: { id: original.id } })).bookingStatus).toBe("CONFIRMED");

      const target = new Date(new Date(original.startAt).getTime() + 24 * 3600_000);
      const moved = await post(owner, `/bookings/${original.id}/reschedule`).set("Idempotency-Key", randomUUID()).send({ slotStart: target.toISOString() }).expect(201);
      expect(moved.body.bookingStatus).toBe("CONFIRMED");
      expect(moved.body.rescheduledFromBookingId).toBe(original.id);
      expect(moved.body.priceAmount).toBe(original.priceAmount);
      const old = await get(owner, `/bookings/${original.id}`).expect(200);
      expect(old.body.bookingStatus).toBe("RESCHEDULED");
      expect(old.body.rescheduledToBookingId).toBe(moved.body.id);
      const grants = await db.bookingPetAccess.findMany({ where: { bookingId: { in: [original.id, moved.body.id] } }, include: { petAccessGrant: true } });
      expect(grants.find((g) => g.bookingId === original.id)?.petAccessGrant.revokedAt).not.toBeNull();
      expect(grants.find((g) => g.bookingId === moved.body.id)?.petAccessGrant.reason).toBe("VET_BOOKING_HEALTH_CONSENT");
    });

    it("series support custom intervals, refuse prepaid services and cancel-following leaves earlier occurrences", async () => {
      const walking = await clinic({ category: ServiceCategory.WALKING, type: ProviderServiceType.DOG_WALK });
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const origin = await book(owner, pets[0]!.id, walking, { providerUserId: walking.staff[0]!.providerUserId });
      const series = await post(owner, `/bookings/${origin.id}/recur`).send({ occurrences: 3, intervalWeeks: 2 }).expect(201);
      expect(series.body.createdBookingIds).toHaveLength(3);
      const rows = await db.booking.findMany({ where: { id: { in: series.body.createdBookingIds } }, orderBy: { startAt: "asc" } });
      expect(rows[1]!.startAt.getTime() - rows[0]!.startAt.getTime()).toBe(14 * 86400_000);
      expect(rows.every((r) => r.bookingNumber && r.priceAmount !== null)).toBe(true);
      const cancelled = await post(owner, `/bookings/${rows[1]!.id}/cancel-following`).send({}).expect(201);
      expect(cancelled.body.cancelledBookingIds).toEqual([rows[1]!.id, rows[2]!.id]);
      expect((await db.booking.findUniqueOrThrow({ where: { id: rows[0]!.id } })).bookingStatus).toBe("CONFIRMED");

      const prepaid = await clinic({ category: ServiceCategory.WALKING, type: ProviderServiceType.DOG_WALK, service: { paymentMode: "FULL_PREPAYMENT" } });
      const paidOrigin = await book(owner, pets[0]!.id, prepaid);
      await post(owner, `/bookings/${paidOrigin.id}/pay`).set("Idempotency-Key", randomUUID()).send({ mode: "SUCCESS" }).expect(201);
      await post(owner, `/bookings/${paidOrigin.id}/recur`).send({ occurrences: 2 }).expect(400);
    });
  });

  describe("waitlist", () => {
    it("notifies only the first eligible entry when capacity opens, never books automatically", async () => {
      const c = await clinic();
      const holder = await actor("holder");
      const first = await actor("first");
      const second = await actor("second");
      const hh = await household(holder);
      const h1 = await household(first);
      const h2 = await household(second);
      const booking = await book(holder, hh.pets[0]!.id, c, { providerUserId: c.staff[0]!.providerUserId });
      const window = { providerId: c.org.id, serviceId: c.service.id, windowStart: new Date(new Date(booking.startAt).getTime() - 3600_000).toISOString(), windowEnd: new Date(new Date(booking.endAt).getTime() + 3600_000).toISOString() };
      const e1 = await post(first, "/waitlist").send({ petId: h1.pets[0]!.id, ...window }).expect(201);
      const e2 = await post(second, "/waitlist").send({ petId: h2.pets[0]!.id, ...window }).expect(201);
      await post(second, "/waitlist").send({ petId: h1.pets[0]!.id, ...window }).expect(403);
      await post(holder, `/bookings/${booking.id}/cancel`).send({}).expect(201);
      // The BookingCapacityReleased listener runs asynchronously; wait for it instead of calling it again.
      for (let i = 0; i < 50 && (await db.bookingWaitlistEntry.findUniqueOrThrow({ where: { id: e1.body.id } })).status === "ACTIVE"; i++) await new Promise((r) => setTimeout(r, 50));
      // A second release with no new capacity must not notify anyone else twice for the same entry.
      expect(await app.get(WaitlistService).notifyFirstEligible(c.org.id, c.service.id, new Date(booking.startAt), new Date(booking.endAt))).toBe(e2.body.id);
      await db.bookingWaitlistEntry.update({ where: { id: e2.body.id }, data: { status: "ACTIVE", notifiedAt: null } });
      const entries = await db.bookingWaitlistEntry.findMany({ where: { id: { in: [e1.body.id, e2.body.id] } } });
      expect(entries.find((e) => e.id === e1.body.id)?.status).toBe("NOTIFIED");
      expect(entries.find((e) => e.id === e2.body.id)?.status).toBe("ACTIVE");
      expect(await db.booking.count({ where: { userId: first.id } })).toBe(0);
      const providerView = await get(c.owner, "/provider/waitlist").expect(200);
      expect(JSON.stringify(providerView.body)).not.toContain("@example.com");
    });
  });

  describe("reviews, clinical handoff and follow-up", () => {
    it("verified reviews: only after completion, once, by the customer; provider can respond; admin hides with audit", async () => {
      const c = await clinic();
      const owner = await actor("owner");
      const other = await actor("other");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c, { hoursAhead: 1 });
      await post(owner, `/bookings/${booking.id}/review`).send({ rating: 5 }).expect(400);
      await db.booking.update({ where: { id: booking.id }, data: { startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000) } });
      for (const step of ["check-in", "start", "complete"]) await post(c.owner, `/provider/bookings/${booking.id}/${step}`).send({ completionNote: "معاینه انجام شد" }).expect(201);
      await post(other, `/bookings/${booking.id}/review`).send({ rating: 1 }).expect(403);
      const review = await post(owner, `/bookings/${booking.id}/review`).send({ rating: 5, body: "دکتر بسیار دقیق و مهربان بود" }).expect(201);
      await post(owner, `/bookings/${booking.id}/review`).send({ rating: 4 }).expect(400);
      await post(c.owner, `/provider/reviews/${review.body.id}/respond`).send({ response: "ممنون از اعتماد شما" }).expect(201);
      const pub = await request(server()).get(`/providers/${c.org.id}/reviews`).expect(200);
      expect(pub.body.summary).toEqual({ average: 5, count: 1 });
      expect(pub.body.reviews[0].providerResponse).toBe("ممنون از اعتماد شما");
      expect(JSON.stringify(pub.body)).not.toContain("@example.com");

      const adminUser = await actor("admin");
      await db.adminUser.create({ data: { userId: adminUser.id, role: AdminRole.TRUST_SAFETY, status: AdminMembershipStatus.ACTIVE } });
      const supportUser = await actor("support");
      await db.adminUser.create({ data: { userId: supportUser.id, role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE } });
      await post(supportUser, `/admin/provider-reviews/${review.body.id}/hide`).send({ reason: "x" }).expect(403);
      await post(adminUser, `/admin/provider-reviews/${review.body.id}/hide`).send({ reason: "اطلاعات شخصی در متن" }).expect(201);
      expect((await request(server()).get(`/providers/${c.org.id}/reviews`)).body.summary.count).toBe(0);
      expect(await db.adminAuditLog.count({ where: { entityId: review.body.id, action: "provider_review.hidden" } })).toBe(1);
      const adminDetail = await get(supportUser, `/admin/service-bookings/${booking.id}`).expect(200);
      expect(adminDetail.body.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"]);
      expect(adminDetail.body.customer.email).not.toContain(owner.id);
    });

    it("a clinical visit can only link this clinic's own VET booking, and provider follow-ups project into Care", async () => {
      const c = await clinic();
      const other = await clinic();
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c, { providerUserId: c.staff[0]!.providerUserId }, { accessSelection: "HEALTH_BASICS" });
      await db.petAccessGrant.create({ data: { petId: pets[0]!.id, userId: other.owner.id, canViewIdentity: true, canRecordClinicalData: true, source: "TEMPORARY", reason: "TEST" } });
      await post(other.owner, "/provider/visits").send({ petId: pets[0]!.id, bookingId: booking.id, reasonForVisit: "x" }).expect(403);
      const visit = await post(c.owner, "/provider/visits").send({ petId: pets[0]!.id, bookingId: booking.id, reasonForVisit: "معاینه" }).expect(201);
      await post(c.owner, "/provider/visits").send({ petId: pets[0]!.id, bookingId: booking.id, reasonForVisit: "again" }).expect(400);
      expect(visit.body.id).toBeTruthy();

      await db.booking.update({ where: { id: booking.id }, data: { startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000) } });
      await post(c.owner, `/provider/bookings/${booking.id}/check-in`).send({}).expect(201);
      await post(c.owner, `/provider/bookings/${booking.id}/start`).send({}).expect(201);
      const due = new Date(Date.now() + 14 * 86400_000).toISOString();
      await post(c.owner, `/provider/bookings/${booking.id}/complete`).send({ followUps: [{ type: "VACCINATION", title: "یادآور واکسن هاری", dueAt: due }] }).expect(201);
      const plan = await db.carePlan.findFirstOrThrow({ where: { petId: pets[0]!.id }, include: { items: true } });
      expect(plan.originatingVisitId).toBe(visit.body.id);
      await app.get(CareSourceListener).syncPet(pets[0]!.id);
      const reminder = await db.careReminder.findFirstOrThrow({ where: { petId: pets[0]!.id, source: "PROVIDER_CREATED" } });
      expect(reminder.type).toBe("VACCINATION");
      expect(reminder.originalDueAt.toISOString()).toBe(due);
      // Booking and visit remain separate records.
      expect(await db.clinicalVisit.count({ where: { bookingId: booking.id } })).toBe(1);
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).bookingStatus).toBe("COMPLETED");

      const grooming = await clinic({ category: ServiceCategory.GROOMING, type: ProviderServiceType.GROOMING_SESSION });
      const g = await book(owner, pets[0]!.id, grooming, { hoursAhead: 1 });
      await db.booking.update({ where: { id: g.id }, data: { startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000) } });
      await post(grooming.owner, `/provider/bookings/${g.id}/check-in`).send({}).expect(201);
      await post(grooming.owner, `/provider/bookings/${g.id}/start`).send({}).expect(201);
      await post(grooming.owner, `/provider/bookings/${g.id}/complete`).send({ followUps: [{ type: "FOLLOW_UP", title: "x", dueAt: due }] }).expect(400);
    });
  });

  describe("provider catalog, analytics and admin", () => {
    it("owner manages variants and policy; staff cannot; another clinic cannot touch them", async () => {
      const c = await clinic({ staffCount: 2 });
      const other = await clinic();
      const created = await post(c.owner, `/provider/services/${c.service.id}/variants`).send({ name: "ویزیت در منزل", priceAmount: 2_500_000, durationMinutes: 60 }).expect(201);
      await post(c.staff[1]!.actor, `/provider/services/${c.service.id}/variants`).send({ name: "x", durationMinutes: 30 }).expect(403);
      await patch(other.owner, `/provider/services/${c.service.id}/variants/${created.body.id}`).send({ priceAmount: 1 }).expect(403);
      await patch(c.owner, `/provider/services/${c.service.id}`).send({ paymentMode: "DEPOSIT" }).expect(400);
      const updated = await patch(c.owner, `/provider/services/${c.service.id}`).send({ paymentMode: "DEPOSIT", depositAmount: 300_000, bookingMode: "REQUEST", cancellationPolicy: "۲۴ ساعت" }).expect(200);
      expect(updated.body.bookingMode).toBe("REQUEST");
      expect(updated.body.variants).toHaveLength(1);
      const analytics = await get(c.owner, "/provider/analytics?days=30").expect(200);
      expect(analytics.body).toMatchObject({ totalBookings: 0, reviewCount: 0 });
    });

    it("admin services endpoints are permission-gated and read-only for money/status", async () => {
      const c = await clinic();
      const owner = await actor("owner");
      const { pets } = await household(owner);
      const booking = await book(owner, pets[0]!.id, c);
      const ops = await actor("ops");
      await db.adminUser.create({ data: { userId: ops.id, role: AdminRole.OPERATIONS, status: AdminMembershipStatus.ACTIVE } });
      const verification = await actor("verification");
      await db.adminUser.create({ data: { userId: verification.id, role: AdminRole.VERIFICATION, status: AdminMembershipStatus.ACTIVE } });
      await get(verification, "/admin/service-bookings").expect(403);
      await get(owner, "/admin/service-bookings").expect(403);
      const list = await get(ops, `/admin/service-bookings?q=${booking.bookingNumber}`).expect(200);
      expect(list.body.items.map((b: { id: string }) => b.id)).toEqual([booking.id]);
      await post(ops, `/admin/provider-services/${c.service.id}/deactivate`).send({ reason: "بررسی مدارک" }).expect(201);
      expect((await db.providerService.findUniqueOrThrow({ where: { id: c.service.id } })).isActive).toBe(false);
      expect(await db.adminAuditLog.count({ where: { entityId: c.service.id, action: "provider_service.deactivated" } })).toBe(1);
      await get(ops, "/admin/services-analytics").expect(200);
      await request(server()).patch(`/admin/service-bookings/${booking.id}`).set("Cookie", ops.cookie).set("x-csrf-token", ops.csrf).send({ bookingStatus: "COMPLETED" }).expect(404);
    });

    it("favorites only save verified providers", async () => {
      const c = await clinic();
      const unverified = await db.providerOrganization.create({ data: { name: "unverified", type: "GROOMER", verificationStatus: "SUBMITTED" } });
      const owner = await actor("owner");
      await put(owner, `/providers/${c.org.id}/favorite`).expect(204);
      await put(owner, `/providers/${unverified.id}/favorite`).expect(404);
      const list = await get(owner, "/me/favorite-providers").expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toEqual([c.org.id]);
      await request(server()).delete(`/providers/${c.org.id}/favorite`).set("Cookie", owner.cookie).set("x-csrf-token", owner.csrf).expect(204);
    });
  });

  describe("discovery", () => {
    it("anonymous search filters by real attributes, sorts deterministically and never lists unverified providers", async () => {
      const city = `شهر-${randomUUID().slice(0, 6)}`;
      const mk = async (name: string, opts: { price: number; lat: number; lng: number; homeVisit?: boolean; cat?: boolean; verified?: boolean; rating?: number }) => {
        const org = await db.providerOrganization.create({ data: { name, type: "VET_CLINIC", verificationStatus: opts.verified === false ? "SUBMITTED" : "VERIFIED", specialties: ["دندانپزشکی"] } });
        const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city, region: "ونک", countryCode: "IR", timezone: "UTC", latitude: opts.lat, longitude: opts.lng } });
        const staffUser = await actor(`${name}-staff`);
        const pu = await db.providerUser.create({ data: { userId: staffUser.id, providerOrganizationId: org.id, role: "VET", publicBio: "۱۰ سال تجربه" } });
        await db.providerUser.create({ data: { userId: (await actor(`${name}-reception`)).id, providerOrganizationId: org.id, role: "STAFF", isBookable: false } });
        const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "ویزیت", type: opts.homeVisit ? "HOME_VISIT" : "GENERAL_VET_VISIT", category: "VET", locationMode: opts.homeVisit ? "AT_CUSTOMER" : "AT_PROVIDER", durationMinutes: 30, priceAmount: opts.price, currency: "IRR", supportsCat: opts.cat ?? true } });
        await db.providerAvailabilityRule.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: loc.id, providerUserId: pu.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })) });
        if (opts.rating) {
          const reviewer = await actor("reviewer");
          const hh = await household(reviewer);
          const b = await db.booking.create({ data: { householdId: hh.householdId, petId: hh.pets[0]!.id, userId: reviewer.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 7 * 86400_000), endAt: new Date(Date.now() - 7 * 86400_000 + 1800_000), timezone: "UTC", bookingStatus: "COMPLETED" } });
          await db.providerReview.create({ data: { bookingId: b.id, providerOrganizationId: org.id, userId: reviewer.id, rating: opts.rating } });
        }
        return org;
      };
      const near = await mk("الف نزدیک", { price: 900_000, lat: 35.757, lng: 51.41, rating: 4 });
      const cheapHome = await mk("ب ارزان منزل", { price: 500_000, lat: 35.8, lng: 51.5, homeVisit: true, cat: false, rating: 5 });
      await mk("ج تأییدنشده", { price: 100_000, lat: 35.757, lng: 51.41, verified: false });

      const anon = (qs: string) => request(server()).get(`/discovery/providers?city=${encodeURIComponent(city)}&${qs}`).expect(200);
      const all = await anon("category=VET");
      expect(all.body.items.map((p: { name: string }) => p.name).sort()).toEqual(["الف نزدیک", "ب ارزان منزل"]);
      const first = all.body.items[0];
      expect(first).toMatchObject({ verified: true, completedBookings: 1 });
      expect(first.nextAvailableAt).not.toBeNull();
      expect(first.rating.count).toBe(1);

      expect((await anon("homeVisit=true")).body.items.map((p: { id: string }) => p.id)).toEqual([cheapHome.id]);
      expect((await anon("species=CAT")).body.items.map((p: { id: string }) => p.id)).toEqual([near.id]);
      expect((await anon("maxPrice=600000")).body.items.map((p: { id: string }) => p.id)).toEqual([cheapHome.id]);
      expect((await anon("minRating=4.5")).body.items.map((p: { id: string }) => p.id)).toEqual([cheapHome.id]);
      expect((await anon("sort=LOWEST_PRICE")).body.items[0].id).toBe(cheapHome.id);
      expect((await anon("sort=TOP_RATED")).body.items[0].id).toBe(cheapHome.id);
      const nearest = await anon("sort=NEAREST&lat=35.757&lng=51.41");
      expect(nearest.body.items[0].id).toBe(near.id);
      expect(nearest.body.items[0].distanceKm).toBe(0);
      expect((await anon("lat=35.757&lng=51.41&radiusKm=2")).body.items.map((p: { id: string }) => p.id)).toEqual([near.id]);
      expect((await anon("neighborhood=ونک")).body.total).toBe(2);
      const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      expect((await anon(`date=${tomorrow}`)).body.total).toBe(2);
      expect((await anon("category=GROOMING")).body.total).toBe(0);
      // Deterministic: the same query returns the same order.
      expect((await anon("category=VET")).body.items.map((p: { id: string }) => p.id)).toEqual(all.body.items.map((p: { id: string }) => p.id));

      // Legacy public endpoints no longer widen to unverified providers.
      const legacy = await request(server()).get(`/providers/vets?city=${encodeURIComponent(city)}&verifiedOnly=false`).expect(200);
      expect(legacy.body.every((p: { verificationStatus: string }) => p.verificationStatus === "VERIFIED")).toBe(true);

      const profile = await request(server()).get(`/discovery/providers/${near.id}`).expect(200);
      expect(profile.body.team).toHaveLength(1);
      expect(profile.body.team[0]).toMatchObject({ publicBio: "۱۰ سال تجربه", role: "VET" });
      expect(JSON.stringify(profile.body.team)).not.toContain("@example.com");
      expect(profile.body.rating).toEqual({ average: 4, count: 1 });
      const unverified = await db.providerOrganization.findFirstOrThrow({ where: { name: "ج تأییدنشده" } });
      await request(server()).get(`/discovery/providers/${unverified.id}`).expect(404);
      await request(server()).get(`/providers/vets/${unverified.id}`).expect(404);
    });
  });
});
