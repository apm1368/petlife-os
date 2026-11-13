import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, LocationMode, ProviderServiceType, ProviderUserRole, SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus, ServiceCategory, type ProviderService } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";
import { PlatformSettingsService } from "../src/modules/platform-settings/platform-settings.service";
import { TravelBookingService } from "../src/modules/travel-marketplace/travel-booking.service";

type Actor = { id: string; cookie: string; csrf: string };

const KEYS = { services: "approvals.mode.serviceBookings", stays: "approvals.mode.stayBookings", orders: "approvals.mode.shopOrders" } as const;
const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/**
 * Approval modes (owner request 2026-11-13): orders and bookings run INSTANT or NEEDS_APPROVAL, set per vertical in
 * admin settings with a per-partner override; approvals go to the follow-up task list and close themselves.
 */
describe("Approval modes — instant vs needs approval, per vertical and per partner", () => {
  let app: INestApplication;
  let db: PrismaService;
  let settings: PlatformSettingsService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, url: string) => request(server()).get(url).set("Cookie", a.cookie);
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const put = (a: Actor, url: string) => request(server()).put(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const del = (a: Actor, url: string) => request(server()).delete(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const unique = () => randomUUID().slice(0, 8);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `approval-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function vertical(key: string, value: string | null) {
    if (value === null) await db.platformSetting.deleteMany({ where: { key } });
    else await db.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await settings.refresh();
  }

  async function household(owner: Actor) {
    const hh = await db.household.create({ data: { name: `Approval home ${unique()}`, members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Toto", species: "DOG", approximateAgeMonths: 30, latestWeightValue: 12, latestWeightUnit: "KG" } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true } });
    return { householdId: hh.id, petId: pet.id };
  }

  async function task(dedupeKey: string, status?: string) {
    // Listeners run as part of publish(); poll briefly so a slow CI box can't make this flaky.
    for (let i = 0; i < 40; i++) {
      const row = await db.adminTask.findUnique({ where: { dedupeKey } });
      if (row && (!status || row.status === status)) return row;
      await new Promise((r) => setTimeout(r, 50));
    }
    return db.adminTask.findUnique({ where: { dedupeKey } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
    settings = app.get(PlatformSettingsService);
  });
  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
    await settings.refresh();
  });
  afterAll(async () => {
    await db.platformSetting.deleteMany({ where: { key: { in: Object.values(KEYS) } } });
    await app.close();
  });

  // ------------------------------------------------------------------ care-service bookings

  describe("service bookings", () => {
    async function clinic(service: Partial<ProviderService> = {}) {
      const org = await db.providerOrganization.create({ data: { name: `Approval clinic ${unique()}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
      const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Test road", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
      const owner = await actor("clinic owner");
      const staff = await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
      const svc = await db.providerService.create({
        data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 30, priceAmount: 1_000_000, currency: "IRR", ...service },
      });
      await db.providerAvailabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: staff.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })),
      });
      return { org, location, service: svc, owner };
    }

    async function book(owner: Actor, petId: string, c: Awaited<ReturnType<typeof clinic>>, hoursAhead = 48) {
      const from = new Date(Date.now() + hoursAhead * 3600_000);
      const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.service.id, from, to: new Date(from.getTime() + 2 * DAY) });
      const slot = slots.find((s) => s.state === "AVAILABLE");
      if (!slot) throw new Error("no slot");
      const hold = await post(owner, "/booking-holds").send({ petId, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, slotStart: slot.startAt.toISOString() }).expect(201);
      return (await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId }).expect(201)).body;
    }

    it("vertical NEEDS_APPROVAL turns an instant service into a request with a follow-up task; the provider's accept closes it", async () => {
      await vertical(KEYS.services, "NEEDS_APPROVAL");
      const c = await clinic(); // the service itself is INSTANT
      const owner = await actor("owner");
      const { petId } = await household(owner);
      const booking = await book(owner, petId, c);
      expect(booking.bookingStatus).toBe("REQUESTED");
      expect(booking.requestExpiresAt).not.toBeNull();
      // The snapshot records the mode this booking actually ran under.
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).bookingMode).toBe("REQUEST");

      const open = await task(`booking-approval:${booking.id}`);
      expect(open).toMatchObject({ source: "BOOKING_APPROVAL", status: "OPEN", team: "OPERATIONS", relatedEntityType: "Booking", relatedEntityId: booking.id });
      expect(open!.dueAt!.toISOString()).toBe(new Date(booking.requestExpiresAt).toISOString());

      // Staff see it in the task list, filtered by source.
      const ops = await actor("ops", AdminRole.OPERATIONS);
      const listed = (await get(ops, "/admin/tasks?source=BOOKING_APPROVAL").expect(200)).body as { total: number; items: { source: string }[] };
      expect(listed.total).toBeGreaterThanOrEqual(1);
      expect(listed.items.every((t) => t.source === "BOOKING_APPROVAL")).toBe(true);

      // The provider still decides; accepting closes the follow-up task.
      const accepted = await post(c.owner, `/provider/bookings/${booking.id}/accept`).send({}).expect(201);
      expect(accepted.body.booking.bookingStatus).toBe("CONFIRMED");
      expect((await task(`booking-approval:${booking.id}`, "DONE"))?.status).toBe("DONE");
    });

    it("an INSTANT override beats the vertical NEEDS_APPROVAL; PARTNER_CHOICE keeps each service's own choice; reject also closes the task", async () => {
      await vertical(KEYS.services, "NEEDS_APPROVAL");
      const trusted = await clinic({ bookingMode: "REQUEST" });
      const admin = await actor("admin", AdminRole.ADMIN);
      const set = await put(admin, `/admin/partners/services/${trusted.org.id}/approval-modes/SERVICE_BOOKINGS`).send({ mode: "INSTANT", reason: "Long-standing trusted clinic" }).expect(200);
      expect(set.body.items.find((i: { scope: string }) => i.scope === "SERVICE_BOOKINGS")).toMatchObject({ vertical: "NEEDS_APPROVAL", effective: "INSTANT", override: { mode: "INSTANT", reason: "Long-standing trusted clinic" } });
      const owner = await actor("owner");
      const { petId } = await household(owner);
      const instant = await book(owner, petId, trusted);
      expect(instant.bookingStatus).toBe("CONFIRMED");
      expect(await db.adminTask.count({ where: { dedupeKey: `booking-approval:${instant.id}` } })).toBe(0);

      // PARTNER_CHOICE (the default) = today's behaviour: a REQUEST service asks, an INSTANT one confirms.
      await vertical(KEYS.services, null);
      const asks = await clinic({ bookingMode: "REQUEST" });
      const confirms = await clinic();
      const requested = await book(owner, petId, asks, 72);
      expect(requested.bookingStatus).toBe("REQUESTED");
      expect((await task(`booking-approval:${requested.id}`))?.status).toBe("OPEN");
      expect((await book(owner, petId, confirms, 96)).bookingStatus).toBe("CONFIRMED");

      await post(asks.owner, `/provider/bookings/${requested.id}/reject`).send({ reason: "Fully booked that day" }).expect(201);
      expect((await task(`booking-approval:${requested.id}`, "DONE"))?.status).toBe("DONE");
    });

    it("the override API needs a reason and settings.manage, rejects a scope that isn't the partner's, and is audited both ways", async () => {
      const c = await clinic();
      const support = await actor("support", AdminRole.SUPPORT);
      const admin = await actor("admin", AdminRole.ADMIN);
      const member = await actor("member");
      const url = `/admin/partners/services/${c.org.id}/approval-modes`;

      const view = (await get(support, url).expect(200)).body;
      expect(view.items.map((i: { scope: string }) => i.scope)).toEqual(["SERVICE_BOOKINGS", "STAY_BOOKINGS"]);
      expect(view.items[0]).toMatchObject({ vertical: "PARTNER_CHOICE", override: null, effective: "PARTNER_CHOICE" });
      await put(support, `${url}/SERVICE_BOOKINGS`).send({ mode: "NEEDS_APPROVAL", reason: "Quality concerns" }).expect(403);
      await get(member, url).expect(403);
      await put(member, `${url}/SERVICE_BOOKINGS`).send({ mode: "NEEDS_APPROVAL", reason: "Quality concerns" }).expect(403);
      await put(admin, `${url}/SERVICE_BOOKINGS`).send({ mode: "NEEDS_APPROVAL" }).expect(400);
      await put(admin, `${url}/SERVICE_BOOKINGS`).send({ mode: "SOMETIMES", reason: "Quality concerns" }).expect(400);
      await put(admin, `${url}/SHOP_ORDERS`).send({ mode: "NEEDS_APPROVAL", reason: "Quality concerns" }).expect(400);
      await put(admin, `/admin/partners/services/${randomUUID()}/approval-modes/SERVICE_BOOKINGS`).send({ mode: "NEEDS_APPROVAL", reason: "Quality concerns" }).expect(404);

      await put(admin, `${url}/SERVICE_BOOKINGS`).send({ mode: "NEEDS_APPROVAL", reason: "Quality concerns" }).expect(200);
      await del(admin, `${url}/SERVICE_BOOKINGS`).send({}).expect(400);
      const cleared = (await del(admin, `${url}/SERVICE_BOOKINGS`).send({ reason: "Concerns resolved" }).expect(200)).body;
      expect(cleared.items[0]).toMatchObject({ override: null, effective: "PARTNER_CHOICE" });
      const audit = await db.adminAuditLog.findMany({ where: { entityId: c.org.id, action: { in: ["partner_approval_override.set", "partner_approval_override.removed"] } }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => [a.action, a.reason])).toEqual([
        ["partner_approval_override.set", "Quality concerns"],
        ["partner_approval_override.removed", "Concerns resolved"],
      ]);
    });
  });

  // ------------------------------------------------------------------ stays

  describe("stay bookings", () => {
    async function host() {
      const owner = await actor("host");
      const org = await db.providerOrganization.create({ data: { name: `Approval stay ${unique()}`, type: "TRAVEL_ACCOMMODATION", verificationStatus: "VERIFIED" } });
      await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
      return { owner, orgId: org.id };
    }
    async function listing(orgId: string, bookingMode: "INSTANT_BOOKING" | "REQUEST_TO_BOOK" = "INSTANT_BOOKING") {
      const l = await db.travelListing.create({
        data: { organizationId: orgId, type: "HOTEL", title: `Approval listing ${unique()}`, description: "Pet friendly", country: "IR", city: `City-${unique()}`, latitude: 35.7, longitude: 51.4, bookingMode, status: "PUBLISHED", isPubliclyListed: true, amenities: ["WIFI"], cancellationPolicy: "See rate terms" },
      });
      await db.travelPetPolicy.create({ data: { listingId: l.id, dogsAllowed: true, catsAllowed: true, maxPets: 2, maxWeightKg: 25, petFeeIrr: 0 } });
      const unit = await db.travelInventoryUnit.create({ data: { listingId: l.id, name: "Room", quantity: 3, maxOccupancy: 2, basePriceIrr: 1_000_000 } });
      return { listingId: l.id, unitId: unit.id };
    }
    async function holdAndSubmit(traveler: Actor, petId: string, l: { listingId: string; unitId: string }, checkIn: string, checkOut: string) {
      const hold = await post(traveler, "/travel/bookings/hold").send({ listingId: l.listingId, unitId: l.unitId, checkIn, checkOut, petIds: [petId] }).expect(201);
      return { hold: hold.body, submitted: (await post(traveler, `/travel/bookings/${hold.body.id}/submit`).send({ acknowledgeMissingInfo: true }).expect(201)).body };
    }

    it("vertical NEEDS_APPROVAL makes an instant listing a request with a task; the host's accept closes it", async () => {
      await vertical(KEYS.stays, "NEEDS_APPROVAL");
      const h = await host();
      const l = await listing(h.orgId);
      const traveler = await actor("traveler");
      const { petId } = await household(traveler);
      const { hold, submitted } = await holdAndSubmit(traveler, petId, l, day(20), day(22));
      // The member sees the request flow from the hold on (snapshotted), and lands in AWAITING_PROVIDER.
      expect(hold.bookingMode).toBe("REQUEST_TO_BOOK");
      expect(submitted.status).toBe("AWAITING_PROVIDER");
      const open = await task(`stay-approval:${submitted.id}`);
      expect(open).toMatchObject({ source: "BOOKING_APPROVAL", status: "OPEN", relatedEntityType: "TravelBooking", relatedEntityId: submitted.id });

      const accepted = await post(h.owner, `/provider/travel/bookings/${submitted.id}/accept`).send({}).expect(201);
      expect(["AWAITING_PAYMENT", "CONFIRMED"]).toContain(accepted.body.status);
      expect((await task(`stay-approval:${submitted.id}`, "DONE"))?.status).toBe("DONE");
    });

    it("an INSTANT override beats the vertical; PARTNER_CHOICE keeps the listing's own mode; expiry closes the task", async () => {
      await vertical(KEYS.stays, "NEEDS_APPROVAL");
      const h = await host();
      const admin = await actor("admin", AdminRole.ADMIN);
      await put(admin, `/admin/partners/services/${h.orgId}/approval-modes/STAY_BOOKINGS`).send({ mode: "INSTANT", reason: "Verified partner hotel" }).expect(200);
      const traveler = await actor("traveler");
      const { petId } = await household(traveler);
      const instant = await holdAndSubmit(traveler, petId, await listing(h.orgId, "REQUEST_TO_BOOK"), day(30), day(31));
      expect(instant.submitted.status).not.toBe("AWAITING_PROVIDER");
      expect(await db.adminTask.count({ where: { dedupeKey: `stay-approval:${instant.submitted.id}` } })).toBe(0);

      await vertical(KEYS.stays, null);
      const other = await host();
      const asks = await holdAndSubmit(traveler, petId, await listing(other.orgId, "REQUEST_TO_BOOK"), day(40), day(41));
      expect(asks.submitted.status).toBe("AWAITING_PROVIDER");
      const confirms = await holdAndSubmit(traveler, petId, await listing(other.orgId), day(42), day(43));
      expect(confirms.submitted.status).not.toBe("AWAITING_PROVIDER");
      expect((await task(`stay-approval:${asks.submitted.id}`))?.status).toBe("OPEN");

      await db.travelBooking.update({ where: { id: asks.submitted.id }, data: { requestExpiresAt: new Date(Date.now() - 1000) } });
      await app.get(TravelBookingService).processExpiries();
      expect((await task(`stay-approval:${asks.submitted.id}`, "DONE"))?.status).toBe("DONE");
    });
  });

  // ------------------------------------------------------------------ shop orders

  describe("shop orders", () => {
    async function customer() {
      const me = await actor("customer");
      const hh = await post(me, "/households").send({}).expect(201);
      const address = await post(me, "/addresses").send({ householdId: hh.body.id, addressLine: "12 Test St.", city: "Tehran", countryCode: "IR", postalCode: "1234567890" }).expect(201);
      return { me, addressId: address.body.id as string };
    }
    async function seller() {
      const owner = await actor("seller");
      const org = await db.sellerOrganization.create({ data: { name: `Approval shop ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
      await db.sellerMembership.create({ data: { sellerOrganizationId: org.id, userId: owner.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
      const category = await db.productCategory.create({ data: { name: `Cat ${unique()}`, slug: `approval-cat-${unique()}` } });
      const product = await db.product.create({ data: { categoryId: category.id, title: `Approval food ${unique()}`, slug: `approval-food-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
      const variant = await db.productVariant.create({ data: { productId: product.id, sku: `APR-${unique()}`, title: "2 kg" } });
      const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: org.id, productVariantId: variant.id, priceAmount: 400_000, currency: "IRR" } });
      await db.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
      return { owner, id: org.id, offerId: offer.id };
    }
    async function paidOrder(me: Actor, addressId: string, offerId: string, quantity = 2) {
      await post(me, "/cart/items").send({ offerId, quantity }).expect(201);
      const checkout = await post(me, "/checkout").send({ addressId }).expect(201);
      await post(me, `/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await post(me, `/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      expect(paid.body.orderIds).toHaveLength(1);
      return paid.body.orderIds[0] as string;
    }
    const fulfillments = (orderId: string) => db.fulfillment.count({ where: { orderId } });

    it("NEEDS_APPROVAL holds the paid order: PENDING, no fulfillment, invisible to the seller, a task; approve sends it to the seller", async () => {
      const admin = await actor("admin", AdminRole.ADMIN);
      // Set through the real admin settings API (a non-high-impact key applies at once).
      const before = (await get(admin, "/admin/settings").expect(200)).body.find((s: { key: string }) => s.key === KEYS.orders);
      expect(before).toMatchObject({ category: "approvals", type: "enum", value: "INSTANT" });
      await put(admin, `/admin/settings/${KEYS.orders}`).send({ value: "PARTNER_CHOICE", baseVersion: before.version, reason: "not an order option" }).expect(400);
      await put(admin, `/admin/settings/${KEYS.orders}`).send({ value: "NEEDS_APPROVAL", baseVersion: before.version, reason: "Owner reviews every order" }).expect(200);
      await get(admin, `/admin/settings/changes?key=${KEYS.orders}`).expect(200);

      const { me, addressId } = await customer();
      const s = await seller();
      const orderId = await paidOrder(me, addressId, s.offerId);
      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PENDING");
      expect(order.confirmedAt).toBeNull();
      expect(await fulfillments(orderId)).toBe(0);
      expect(await db.orderFinancialBreakdown.count({ where: { orderId } })).toBe(0);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: s.offerId } })).onHand).toBe(8);

      // The member sees it as awaiting confirmation and may still cancel it.
      const mine = (await get(me, `/orders/${orderId}`).expect(200)).body;
      expect(mine).toMatchObject({ status: "PENDING", fulfillment: null, canCancel: true });

      // The seller does not see it as work: not in the list, not in the dashboard, no detail, no cancel.
      const list = (await get(s.owner, `/seller-organizations/${s.id}/orders`).expect(200)).body;
      expect(list.items.map((o: { orderId: string }) => o.orderId)).not.toContain(orderId);
      expect((await get(s.owner, `/seller-organizations/${s.id}/orders?status=PENDING`).expect(200)).body.items).toEqual([]);
      await get(s.owner, `/seller-organizations/${s.id}/orders/${orderId}`).expect(404);
      await post(s.owner, `/seller-organizations/${s.id}/orders/${orderId}/cancel`).send({ reason: "Not ours yet" }).expect(404);
      const dashboard = (await get(s.owner, `/seller-organizations/${s.id}/dashboard`).expect(200)).body;
      expect(dashboard).toMatchObject({ ordersRequiringActionCount: 0, ordersToday: 0 });

      const open = await task(`order-approval:${orderId}`);
      expect(open).toMatchObject({ source: "ORDER_APPROVAL", status: "OPEN", relatedEntityType: "Order", relatedEntityId: orderId, priority: "HIGH" });

      // Only commerce.manage approves: a member and a view-only admin get 403.
      const member = await actor("member");
      const viewer = await actor("support", AdminRole.SUPPORT);
      await post(member, `/admin/commerce/orders/${orderId}/approve`).send({}).expect(403);
      await post(viewer, `/admin/commerce/orders/${orderId}/approve`).send({}).expect(403);
      await post(viewer, `/admin/commerce/orders/${orderId}/reject`).send({ reason: "Suspicious order" }).expect(403);

      const approved = (await post(admin, `/admin/commerce/orders/${orderId}/approve`).send({ note: "Checked with the customer" }).expect(201)).body;
      expect(approved.status).toBe("CONFIRMED");
      const fulfillment = await db.fulfillment.findUniqueOrThrow({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } });
      expect(fulfillment.status).toBe("AWAITING_SELLER_PREPARATION");
      expect(await db.orderFinancialBreakdown.count({ where: { orderId } })).toBe(1);
      expect((await task(`order-approval:${orderId}`, "DONE"))?.status).toBe("DONE");
      expect(await db.adminAuditLog.count({ where: { action: "order.approved_by_staff", entityId: orderId } })).toBe(1);
      expect((await db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } })).map((e) => e.toStatus)).toEqual(["PENDING", "CONFIRMED"]);
      // Approving twice is refused.
      expect((await post(admin, `/admin/commerce/orders/${orderId}/approve`).send({}).expect(409)).body.error.code).toBe("ORDER_NOT_AWAITING_APPROVAL");

      // Now it is the seller's work.
      expect((await get(s.owner, `/seller-organizations/${s.id}/orders`).expect(200)).body.items.map((o: { orderId: string }) => o.orderId)).toContain(orderId);
      await get(s.owner, `/seller-organizations/${s.id}/orders/${orderId}`).expect(200);
      expect((await get(s.owner, `/seller-organizations/${s.id}/dashboard`).expect(200)).body.ordersRequiringActionCount).toBe(1);
    });

    it("reject refunds in full on the staff-cancel path, restocks, closes the task and is audited", async () => {
      await vertical(KEYS.orders, "NEEDS_APPROVAL");
      const admin = await actor("admin", AdminRole.ADMIN);
      const { me, addressId } = await customer();
      const s = await seller();
      const orderId = await paidOrder(me, addressId, s.offerId);
      await post(admin, `/admin/commerce/orders/${orderId}/reject`).send({}).expect(400);
      const rejected = (await post(admin, `/admin/commerce/orders/${orderId}/reject`).send({ reason: "Seller cannot supply this batch" }).expect(201)).body;
      expect(rejected.cancelledAt).toBeTruthy();
      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order).toMatchObject({ status: "REFUNDED", cancelledBy: "ADMIN", cancelReason: "Seller cannot supply this batch" });
      const refund = await db.refund.findFirstOrThrow({ where: { orderId } });
      expect(refund).toMatchObject({ status: "SUCCEEDED", amount: order.totalAmount });
      expect(await fulfillments(orderId)).toBe(0);
      expect((await db.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: s.offerId } })).onHand).toBe(10);
      expect((await task(`order-approval:${orderId}`, "DONE"))?.status).toBe("DONE");
      expect(await db.adminAuditLog.count({ where: { action: "order.rejected_by_staff", entityId: orderId } })).toBe(1);
      // The seller never saw it, so nobody tells them it was cancelled.
      expect(await db.notification.count({ where: { entityId: orderId, userId: s.owner.id } })).toBe(0);
      expect((await get(me, `/orders/${orderId}`).expect(200)).body.status).toBe("REFUNDED");
      await post(admin, `/admin/commerce/orders/${orderId}/reject`).send({ reason: "Again" }).expect(409);
      await post(admin, `/admin/commerce/orders/${orderId}/approve`).send({}).expect(409);
    });

    it("a seller override beats the vertical in both directions; the default stays instant", async () => {
      const admin = await actor("admin", AdminRole.ADMIN);
      const { me, addressId } = await customer();
      const strict = await seller();
      const trusted = await seller();
      const plain = await seller();
      await put(admin, `/admin/partners/shops/${strict.id}/approval-modes/SHOP_ORDERS`).send({ mode: "NEEDS_APPROVAL", reason: "New shop, first orders reviewed" }).expect(200);
      await put(admin, `/admin/partners/shops/${trusted.id}/approval-modes/SHOP_ORDERS`).send({ mode: "INSTANT", reason: "Trusted long-time seller" }).expect(200);
      await put(admin, `/admin/partners/shops/${plain.id}/approval-modes/SERVICE_BOOKINGS`).send({ mode: "INSTANT", reason: "Wrong flow for a shop" }).expect(400);

      // Vertical INSTANT (default): the strict seller's order is held, the plain one is not.
      expect((await db.order.findUniqueOrThrow({ where: { id: await paidOrder(me, addressId, strict.offerId, 1) } })).status).toBe("PENDING");
      const plainOrder = await paidOrder(me, addressId, plain.offerId, 1);
      expect((await db.order.findUniqueOrThrow({ where: { id: plainOrder } })).status).toBe("CONFIRMED");
      expect(await fulfillments(plainOrder)).toBe(1);
      expect(await db.adminTask.count({ where: { dedupeKey: `order-approval:${plainOrder}` } })).toBe(0);

      // Vertical NEEDS_APPROVAL: the trusted seller's override keeps it instant.
      await vertical(KEYS.orders, "NEEDS_APPROVAL");
      const trustedOrder = await paidOrder(me, addressId, trusted.offerId, 1);
      expect((await db.order.findUniqueOrThrow({ where: { id: trustedOrder } })).status).toBe("CONFIRMED");
      expect((await get(admin, `/admin/partners/shops/${trusted.id}/approval-modes`).expect(200)).body.items).toEqual([
        expect.objectContaining({ scope: "SHOP_ORDERS", vertical: "NEEDS_APPROVAL", effective: "INSTANT" }),
      ]);
    });
  });
});
