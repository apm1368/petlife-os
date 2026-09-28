import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import {
  AdminMembershipStatus,
  AdminRole,
  FulfillmentStatus,
  PromotionDiscountType,
  PromotionScope,
  PromotionStatus,
  SellerMembershipRole,
  SellerMembershipStatus,
  SellerStatus,
  SellerVerificationStatus,
} from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RepeatDeliveryService } from "../src/modules/commerce/repeat-delivery/repeat-delivery.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  const match = /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Could not parse OTP code from log line");
  return match[1]!;
}

/**
 * Batch 4 — Commerce completion: server-side pricing and promotions,
 * checkout integrity, order lifecycle (cancel / refund request / admin
 * review), reviews, favorites, repeat delivery, seller and admin commerce.
 * Every flow goes through the real HTTP surface.
 */
describe("Batch 4 — Commerce", () => {
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

  afterEach(() => {
    logSpy.mockRestore();
  });

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

  async function customer() {
    const identifier = `b4-customer-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await c.post("/households").send({}).expect(201);
    const address = await c.post("/addresses").send({ householdId: household.body.id, addressLine: "12 Test St.", city: "Tehran", countryCode: "IR", postalCode: "1234567890" }).expect(201);
    return { c, userId: user.id, householdId: household.body.id as string, addressId: address.body.id as string };
  }

  async function seller(name = `B4 Seller ${unique()}`) {
    const identifier = `b4-seller-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const org = await prisma.sellerOrganization.create({ data: { name, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    await prisma.sellerMembership.create({ data: { sellerOrganizationId: org.id, userId: user.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    return { c, id: org.id, userId: user.id };
  }

  async function admin(role: AdminRole) {
    const identifier = `b4-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const c = client(await signUp(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const adminUser = await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { c, userId: user.id, adminUserId: adminUser.id };
  }

  async function product(opts: { categoryId?: string; title?: string } = {}) {
    const categoryId = opts.categoryId ?? (await prisma.productCategory.create({ data: { name: `B4 Cat ${unique()}`, slug: `b4-cat-${unique()}` } })).id;
    const p = await prisma.product.create({ data: { categoryId, title: opts.title ?? `B4 Product ${unique()}`, slug: `b4-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: p.id, sku: `B4-${unique()}`, title: "2 kg" } });
    return { product: p, variant, categoryId };
  }

  async function offer(sellerId: string, variantId: string, priceAmount: number, onHand = 20, repeat?: number[]) {
    const o = await prisma.sellerOffer.create({
      data: { sellerOrganizationId: sellerId, productVariantId: variantId, priceAmount, currency: "IRR", repeatDeliveryEligible: Boolean(repeat), repeatIntervalsDays: repeat ?? [] },
    });
    await prisma.inventoryItem.create({ data: { sellerOfferId: o.id, onHand } });
    return o;
  }

  async function promotion(data: { scope: PromotionScope; value: number; discountType?: PromotionDiscountType; categoryIds?: string[]; productIds?: string[]; owner?: string; usageLimit?: number }) {
    const creator = await prisma.user.findFirstOrThrow();
    return prisma.promotion.create({
      data: {
        name: `Promo ${unique()}`,
        discountType: data.discountType ?? PromotionDiscountType.PERCENT,
        value: data.value,
        scope: data.scope,
        categoryIds: data.categoryIds ?? [],
        productIds: data.productIds ?? [],
        sellerOrganizationIds: data.owner ? [data.owner] : [],
        ownerSellerOrganizationId: data.owner ?? null,
        fundedBy: data.owner ? "SELLER" : "PLATFORM",
        startsAt: new Date(Date.now() - 60_000),
        status: PromotionStatus.ACTIVE,
        usageLimit: data.usageLimit ?? null,
        createdByUserId: creator.id,
      },
    });
  }

  async function paidOrder(c: Client, addressId: string, offerId: string, quantity = 1) {
    await c.post("/cart/items").send({ offerId, quantity }).expect(201);
    const checkout = await c.post("/checkout").send({ addressId }).expect(201);
    await c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await c.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    expect(paid.body.orderIds).toHaveLength(1);
    return { orderId: paid.body.orderIds[0] as string, checkout: checkout.body };
  }

  async function setFulfillment(orderId: string, status: FulfillmentStatus, deliveredAt?: Date) {
    await prisma.fulfillment.update({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } }, data: { status, ...(deliveredAt ? { deliveredAt } : {}) } });
  }

  // ------------------------------------------------------------- pricing

  describe("server-side pricing and promotions", () => {
    it("applies a parent-category promotion to a child product, best discount wins, and never stacks", async () => {
      const s = await seller();
      const parent = await prisma.productCategory.create({ data: { name: `Parent ${unique()}`, slug: `parent-${unique()}` } });
      const child = await prisma.productCategory.create({ data: { name: `Child ${unique()}`, slug: `child-${unique()}`, parentId: parent.id } });
      const { product: p, variant } = await product({ categoryId: child.id });
      const o = await offer(s.id, variant.id, 1_000_000);
      await promotion({ scope: PromotionScope.CATEGORY, categoryIds: [parent.id], value: 10 });
      await promotion({ scope: PromotionScope.PRODUCT, productIds: [p.id], value: 20 });

      const detail = await request(server).get(`/shop/products/${p.id}`).expect(200);
      const priced = detail.body.offers.find((x: { id: string }) => x.id === o.id);
      expect(priced.priceAmount).toBe(1_000_000);
      expect(priced.effectiveUnitPrice).toBe(800_000);
      expect(priced.unitDiscount).toBe(200_000);
      expect(priced.promotion.name).toBeTruthy();
    });

    it("a seller-funded promotion never discounts another seller's offer of the same product", async () => {
      const a = await seller();
      const b = await seller();
      const { product: p, variant } = await product();
      const oa = await offer(a.id, variant.id, 500_000);
      const ob = await offer(b.id, variant.id, 500_000);
      await promotion({ scope: PromotionScope.ALL, value: 30, owner: a.id });

      const offers = await request(server).get(`/shop/products/${p.id}/offers`).expect(200);
      expect(offers.body.find((x: { id: string }) => x.id === oa.id).effectiveUnitPrice).toBe(350_000);
      expect(offers.body.find((x: { id: string }) => x.id === ob.id).effectiveUnitPrice).toBe(500_000);
    });

    it("rejects client-supplied prices and out-of-range quantities", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 250_000, 50);

      await cu.c.post("/cart/items").send({ offerId: o.id, quantity: 1, unitPrice: 1 }).expect(400);
      for (const quantity of [0, -1, 21, 1.5]) await cu.c.post("/cart/items").send({ offerId: o.id, quantity }).expect(400);

      await cu.c.post("/cart/items").send({ offerId: o.id, quantity: 2 }).expect(201);
      const cart = await cu.c.get("/cart").expect(200);
      const line = cart.body.sellerGroups[0].lines[0];
      expect(line.currentPriceAmount).toBe(250_000);
      expect(line.lineTotal).toBe(500_000);
    });

    it("a price change is flagged on the cart line until the customer accepts the new price", async () => {
      const cu = await customer();
      const s2 = await seller();
      const { variant } = await product();
      const o = await offer(s2.id, variant.id, 400_000, 10);
      await cu.c.post("/cart/items").send({ offerId: o.id, quantity: 1 }).expect(201);
      await prisma.sellerOffer.update({ where: { id: o.id }, data: { priceAmount: 450_000 } });

      const changed = await cu.c.get("/cart").expect(200);
      const line = changed.body.sellerGroups[0].lines[0];
      expect(line.issues).toContain("PRICE_CHANGED");
      expect(line.lineTotal).toBe(450_000);
      expect(changed.body.hasBlockingIssues).toBe(false);

      const accepted = await cu.c.post("/cart/accept-prices").expect(201);
      expect(accepted.body.sellerGroups[0].lines[0].issues).not.toContain("PRICE_CHANGED");
      expect(accepted.body.sellerGroups[0].lines[0].unitPriceSnapshot).toBe(450_000);
    });

    it("search is paginated with facets and filters by price and stock", async () => {
      const s = await seller();
      const token = unique();
      const { variant: v1 } = await product({ title: `Facet ${token} A` });
      const { variant: v2 } = await product({ title: `Facet ${token} B` });
      await offer(s.id, v1.id, 100_000, 10);
      await offer(s.id, v2.id, 900_000, 0);

      const all = await request(server).get(`/shop/products?search=${encodeURIComponent(token)}`).expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.facets.sellers.some((f: { id: string }) => f.id === s.id)).toBe(true);

      const cheapInStock = await request(server).get(`/shop/products?search=${encodeURIComponent(token)}&maxPrice=500000&inStock=true`).expect(200);
      expect(cheapInStock.body.items).toHaveLength(1);
      expect(cheapInStock.body.items[0].title).toContain("A");
    });
  });

  // ------------------------------------------------------------ checkout

  describe("checkout integrity", () => {
    it("charges subtotal − discount, snapshots discounts on the order, records the redemption, and counts usage once", async () => {
      const cu = await customer();
      const s = await seller();
      const { product: p, variant } = await product();
      const o = await offer(s.id, variant.id, 1_000_000);
      const promo = await promotion({ scope: PromotionScope.PRODUCT, productIds: [p.id], value: 25 });

      await cu.c.post("/cart/items").send({ offerId: o.id, quantity: 2 }).expect(201);
      const checkout = await cu.c.post("/checkout").send({ addressId: cu.addressId }).expect(201);
      expect(checkout.body.subtotalAmount).toBe(2_000_000);
      expect(checkout.body.discountAmount).toBe(500_000);
      expect(checkout.body.totalAmount).toBe(1_500_000);

      await cu.c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await cu.c.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const detail = await cu.c.get(`/orders/${paid.body.orderIds[0]}`).expect(200);
      expect(detail.body.subtotalAmount).toBe(2_000_000);
      expect(detail.body.discountAmount).toBe(500_000);
      expect(detail.body.totalAmount).toBe(1_500_000);
      expect(detail.body.items[0].listUnitPrice).toBe(1_000_000);
      expect(detail.body.items[0].unitDiscount).toBe(250_000);
      expect(detail.body.items[0].promotionName).toBe(promo.name);
      expect(detail.body.orderNumber).toMatch(/^PL-[0-9A-F]{8}$/);
      expect(detail.body.timeline[0].toStatus).toBe("CONFIRMED");

      const redemptions = await prisma.promotionRedemption.findMany({ where: { promotionId: promo.id } });
      expect(redemptions).toHaveLength(1);
      expect(redemptions[0]!.amount).toBe(500_000);
      expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } })).usageCount).toBe(1);
    });

    it("builds orders from the checkout snapshot — items added to the cart afterwards are never charged or ordered", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant: v1 } = await product();
      const { variant: v2 } = await product();
      const o1 = await offer(s.id, v1.id, 300_000);
      const o2 = await offer(s.id, v2.id, 700_000);

      await cu.c.post("/cart/items").send({ offerId: o1.id, quantity: 1 }).expect(201);
      const checkout = await cu.c.post("/checkout").send({ addressId: cu.addressId }).expect(201);
      await cu.c.post("/cart/items").send({ offerId: o2.id, quantity: 1 }).expect(201);
      await cu.c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await cu.c.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.body.orderIds[0] }, include: { items: true } });
      expect(order.items.map((i) => i.sellerOfferId)).toEqual([o1.id]);
      expect(order.totalAmount).toBe(checkout.body.totalAmount);
    });

    it("refuses the decorative EXPRESS flat delivery method", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 100_000);
      await cu.c.post("/cart/items").send({ offerId: o.id, quantity: 1 }).expect(201);
      const res = await cu.c.post("/checkout").send({ addressId: cu.addressId, deliveryMethod: "EXPRESS" }).expect(400);
      expect(res.body.error.details.reason).toBe("DELIVERY_METHOD_UNAVAILABLE");
    });

    it("two customers racing for the last unit: exactly one checkout reserves it", async () => {
      const a = await customer();
      const b = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 100_000, 1);
      await a.c.post("/cart/items").send({ offerId: o.id, quantity: 1 }).expect(201);
      await b.c.post("/cart/items").send({ offerId: o.id, quantity: 1 }).expect(201);
      const results = await Promise.all([a.c.post("/checkout").send({ addressId: a.addressId }), b.c.post("/checkout").send({ addressId: b.addressId })]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(201);
      expect([400, 409]).toContain(statuses[1]);
      const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: o.id } });
      expect(item.reserved).toBe(1);
    });
  });

  // ------------------------------------------------------ order lifecycle

  describe("order lifecycle", () => {
    it("cancel before dispatch refunds in full, cancels the fulfillment, restocks, and cannot run twice", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 400_000, 10);
      const { orderId } = await paidOrder(cu.c, cu.addressId, o.id, 3);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: o.id } })).onHand).toBe(7);

      const before = await cu.c.get(`/orders/${orderId}`).expect(200);
      expect(before.body.canCancel).toBe(true);
      const refund = await cu.c.post(`/orders/${orderId}/cancel`).send({ reason: "Ordered the wrong size" }).expect(201);
      expect(refund.body.status).toBe("SUCCEEDED");
      expect(refund.body.amount).toBe(1_200_000);

      const after = await cu.c.get(`/orders/${orderId}`).expect(200);
      expect(after.body.status).toBe("REFUNDED");
      expect(after.body.cancelledAt).toBeTruthy();
      expect(after.body.cancelReason).toBe("Ordered the wrong size");
      expect(after.body.canCancel).toBe(false);
      expect(after.body.fulfillment.status).toBe("CANCELED");
      expect(after.body.timeline.map((e: { toStatus: string }) => e.toStatus)).toEqual(["CONFIRMED", "REFUNDED"]);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: o.id } })).onHand).toBe(10);

      const again = await cu.c.post(`/orders/${orderId}/cancel`).send({}).expect(409);
      expect(again.body.error.code).toBe("ORDER_NOT_CANCELLABLE");
    });

    it("after dispatch: no cancel and no instant refund; after delivery a refund request goes to admin review and finance executes it", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 600_000);
      const { orderId } = await paidOrder(cu.c, cu.addressId, o.id);

      await setFulfillment(orderId, FulfillmentStatus.PICKED_UP);
      expect((await cu.c.post(`/orders/${orderId}/cancel`).send({}).expect(409)).body.error.code).toBe("ORDER_NOT_CANCELLABLE");
      expect((await cu.c.post(`/orders/${orderId}/refunds`).send({}).expect(400)).body.error.code).toBe("REFUND_NOT_SUPPORTED");
      expect((await cu.c.post(`/orders/${orderId}/refund-requests`).send({ reason: "DAMAGED" }).expect(409)).body.error.code).toBe("REFUND_REQUEST_NOT_ALLOWED");
      expect(await prisma.refund.count({ where: { orderId } })).toBe(0);

      await setFulfillment(orderId, FulfillmentStatus.DELIVERED, new Date());
      const req = await cu.c.post(`/orders/${orderId}/refund-requests`).send({ reason: "DAMAGED", description: "The bag arrived torn." }).expect(201);
      expect(req.body.status).toBe("PENDING_REVIEW");
      expect(req.body.requestedAmount).toBe(600_000);
      await cu.c.post(`/orders/${orderId}/refund-requests`).send({ reason: "OTHER" }).expect(409);

      const support = await admin(AdminRole.SUPPORT);
      await support.c.get(`/admin/commerce/refund-requests?status=PENDING_REVIEW`).expect(200);
      await support.c.post(`/admin/commerce/refund-requests/${req.body.id}/approve`).send({}).expect(403);

      const finance = await admin(AdminRole.FINANCE);
      const approved = await finance.c.post(`/admin/commerce/refund-requests/${req.body.id}/approve`).send({ note: "Photo evidence OK" }).expect(201);
      expect(approved.body.status).toBe("APPROVED");
      expect(approved.body.adminRefundApprovalId).toBeTruthy();
      await finance.c.post(`/admin/commerce/refund-requests/${req.body.id}/reject`).send({ reason: "too late" }).expect(409);
      expect(await prisma.refund.count({ where: { orderId } })).toBe(0);

      const executed = await finance.c.patch(`/admin/transactions/refund-approvals/${approved.body.adminRefundApprovalId}/execute`).send({}).expect(200);
      expect(executed.body.status).toBe("EXECUTED");
      const order = await cu.c.get(`/orders/${orderId}`).expect(200);
      expect(order.body.status).toBe("REFUNDED");
      expect(order.body.refunds[0].status).toBe("SUCCEEDED");
      expect(order.body.refundRequests[0].status).toBe("APPROVED");
      const audit = await prisma.adminAuditLog.findFirst({ where: { entityType: "ORDER_REFUND_REQUEST", entityId: req.body.id } });
      expect(audit?.action).toBe("order_refund_request.approved");
    });

    it("a refund request outside the return window, or twice at once, is refused", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 200_000);
      const late = await paidOrder(cu.c, cu.addressId, o.id);
      await setFulfillment(late.orderId, FulfillmentStatus.DELIVERED, new Date(Date.now() - 8 * 86_400_000));
      await cu.c.post(`/orders/${late.orderId}/refund-requests`).send({ reason: "OTHER" }).expect(409);

      const race = await paidOrder(cu.c, cu.addressId, o.id);
      await setFulfillment(race.orderId, FulfillmentStatus.DELIVERED, new Date());
      const results = await Promise.all([
        cu.c.post(`/orders/${race.orderId}/refund-requests`).send({ reason: "DAMAGED" }),
        cu.c.post(`/orders/${race.orderId}/refund-requests`).send({ reason: "DAMAGED" }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it("order ids are private: another customer gets 404 on read, cancel, refund request and review", async () => {
      const owner = await customer();
      const other = await customer();
      const s = await seller();
      const { variant } = await product();
      const o = await offer(s.id, variant.id, 150_000);
      const { orderId } = await paidOrder(owner.c, owner.addressId, o.id);
      const itemId = (await prisma.orderItem.findFirstOrThrow({ where: { orderId } })).id;

      await other.c.get(`/orders/${orderId}`).expect(404);
      await other.c.post(`/orders/${orderId}/cancel`).send({}).expect(404);
      await other.c.post(`/orders/${orderId}/refunds`).send({}).expect(404);
      await other.c.post(`/orders/${orderId}/refund-requests`).send({ reason: "OTHER" }).expect(404);
      await other.c.post(`/orders/${orderId}/items/${itemId}/review`).send({ rating: 1 }).expect(404);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CONFIRMED");
    });
  });

  // ------------------------------------------------ reviews and favorites

  describe("reviews and favorites", () => {
    it("only a delivered purchase can be reviewed once; hidden reviews leave the public list and the rating", async () => {
      const cu = await customer();
      const s = await seller();
      const { product: p, variant } = await product();
      const o = await offer(s.id, variant.id, 300_000);
      const { orderId } = await paidOrder(cu.c, cu.addressId, o.id);
      const itemId = (await prisma.orderItem.findFirstOrThrow({ where: { orderId } })).id;

      expect((await cu.c.post(`/orders/${orderId}/items/${itemId}/review`).send({ rating: 5 }).expect(409)).body.error.code).toBe("REVIEW_NOT_ALLOWED");
      await setFulfillment(orderId, FulfillmentStatus.DELIVERED, new Date());
      await cu.c.post(`/orders/${orderId}/items/${itemId}/review`).send({ rating: 6 }).expect(400);
      const review = await cu.c.post(`/orders/${orderId}/items/${itemId}/review`).send({ rating: 4, body: "My dog loves it" }).expect(201);
      expect(review.body.verifiedPurchase).toBe(true);
      await cu.c.post(`/orders/${orderId}/items/${itemId}/review`).send({ rating: 1 }).expect(409);

      const detail = await request(server).get(`/shop/products/${p.id}`).expect(200);
      expect(detail.body.rating).toEqual({ average: 4, count: 1 });
      expect((await cu.c.get(`/orders/${orderId}`).expect(200)).body.items[0].reviewId).toBe(review.body.id);

      const trust = await admin(AdminRole.TRUST_SAFETY);
      await trust.c.patch(`/admin/commerce/reviews/${review.body.id}/visibility`).send({ hidden: true, reason: "Contains a phone number" }).expect(200);
      const list = await request(server).get(`/shop/products/${p.id}/reviews`).expect(200);
      expect(list.body.total).toBe(0);
      expect((await request(server).get(`/shop/products/${p.id}`).expect(200)).body.rating.count).toBe(0);
    });

    it("favorites are per user and idempotent", async () => {
      const cu = await customer();
      const s = await seller();
      const { product: p, variant } = await product();
      await offer(s.id, variant.id, 100_000);
      // Anonymous writes are refused (CSRF/session), and nothing is stored.
      expect([401, 403]).toContain((await request(server).put(`/shop/products/${p.id}/favorite`)).status);
      await cu.c.put(`/shop/products/${p.id}/favorite`).expect(200);
      await cu.c.put(`/shop/products/${p.id}/favorite`).expect(200);
      const favorites = await cu.c.get("/me/favorite-products").expect(200);
      expect(favorites.body.map((f: { id: string }) => f.id)).toEqual([p.id]);
      expect((await cu.c.get(`/shop/products/${p.id}`).expect(200)).body.favorited).toBe(true);
      await cu.c.delete(`/shop/products/${p.id}/favorite`).expect(200);
      expect((await cu.c.get("/me/favorite-products").expect(200)).body).toHaveLength(0);
    });
  });

  // ------------------------------------------------------ repeat delivery

  describe("repeat delivery", () => {
    it("is reminder-driven, revalidates price, and a confirmed cycle order advances the schedule", async () => {
      const cu = await customer();
      const s = await seller();
      const { variant } = await product();
      const plain = await offer(s.id, variant.id, 900_000);
      const o = await offer((await seller()).id, variant.id, 800_000, 30, [14, 30]);

      expect((await cu.c.post("/repeat-deliveries").send({ sellerOfferId: plain.id, quantity: 1, intervalDays: 30, addressId: cu.addressId }).expect(409)).body.error.code).toBe("REPEAT_DELIVERY_NOT_OFFERED");
      await cu.c.post("/repeat-deliveries").send({ sellerOfferId: o.id, quantity: 1, intervalDays: 21, addressId: cu.addressId }).expect(400);
      const created = await cu.c.post("/repeat-deliveries").send({ sellerOfferId: o.id, quantity: 2, intervalDays: 30, addressId: cu.addressId }).expect(201);
      expect(created.body.acceptedUnitPrice).toBe(800_000);
      await cu.c.post("/repeat-deliveries").send({ sellerOfferId: o.id, quantity: 1, intervalDays: 14, addressId: cu.addressId }).expect(409);

      const skipped = await cu.c.post(`/repeat-deliveries/${created.body.id}/skip`).expect(201);
      expect(new Date(skipped.body.nextCycleAt).getTime() - new Date(created.body.nextCycleAt).getTime()).toBe(30 * 86_400_000);
      await cu.c.post(`/repeat-deliveries/${created.body.id}/pause`).expect(201);
      await cu.c.post(`/repeat-deliveries/${created.body.id}/order-cycle`).expect(409);
      await cu.c.post(`/repeat-deliveries/${created.body.id}/resume`).expect(201);

      // Make the cycle due and send the reminder exactly once.
      await prisma.repeatDeliverySchedule.update({ where: { id: created.body.id }, data: { nextCycleAt: new Date(Date.now() + 86_400_000) } });
      const worker = app.get(RepeatDeliveryService);
      expect(await worker.sendDueReminders()).toBeGreaterThanOrEqual(1);
      expect(await prisma.repeatDeliverySchedule.findUniqueOrThrow({ where: { id: created.body.id } }).then((r) => r.reminderSentAt)).toBeTruthy();
      const secondPass = await prisma.repeatDeliveryEvent.count({ where: { scheduleId: created.body.id, type: "REMINDER_SENT" } });
      await worker.sendDueReminders();
      expect(await prisma.repeatDeliveryEvent.count({ where: { scheduleId: created.body.id, type: "REMINDER_SENT" } })).toBe(secondPass);

      // A price change blocks the cycle until the customer accepts it; nothing is charged automatically.
      await prisma.sellerOffer.update({ where: { id: o.id }, data: { priceAmount: 850_000 } });
      const blocked = await cu.c.post(`/repeat-deliveries/${created.body.id}/order-cycle`).expect(409);
      expect(blocked.body.error.code).toBe("REPEAT_DELIVERY_PRICE_CHANGED");
      expect(await prisma.paymentIntent.count({ where: { checkout: { userId: cu.userId } } })).toBe(0);
      await cu.c.post(`/repeat-deliveries/${created.body.id}/accept-price`).expect(201);
      const cart = await cu.c.post(`/repeat-deliveries/${created.body.id}/order-cycle`).expect(201);
      expect(cart.body.sellerGroups[0].lines[0].quantity).toBe(2);

      const checkout = await cu.c.post("/checkout").send({ addressId: cu.addressId }).expect(201);
      await cu.c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
      const paid = await cu.c.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
      const after = await cu.c.get(`/repeat-deliveries/${created.body.id}`).expect(200);
      expect(after.body.lastOrderId).toBe(paid.body.orderIds[0]);
      expect(new Date(after.body.nextCycleAt).getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);
    });

    it("another user cannot read or change someone else's schedule", async () => {
      const owner = await customer();
      const other = await customer();
      const { variant } = await product();
      const o = await offer((await seller()).id, variant.id, 100_000, 10, [30]);
      const created = await owner.c.post("/repeat-deliveries").send({ sellerOfferId: o.id, quantity: 1, intervalDays: 30, addressId: owner.addressId }).expect(201);
      await other.c.get(`/repeat-deliveries/${created.body.id}`).expect(404);
      await other.c.post(`/repeat-deliveries/${created.body.id}/cancel`).expect(404);
      // Nor attach someone else's address.
      await other.c.post("/repeat-deliveries").send({ sellerOfferId: o.id, quantity: 1, intervalDays: 30, addressId: owner.addressId }).expect(403);
    });
  });

  // ------------------------------------------------------ seller and admin

  describe("seller isolation and admin RBAC", () => {
    it("a seller manages only its own promotions and only for products it sells", async () => {
      const a = await seller();
      const b = await seller();
      const { product: pa, variant: va } = await product();
      const { product: pb, variant: vb } = await product();
      await offer(a.id, va.id, 100_000);
      await offer(b.id, vb.id, 100_000);
      const startsAt = new Date().toISOString();

      await a.c.post(`/seller-organizations/${a.id}/promotions`).send({ name: "Not mine", discountType: "PERCENT", value: 10, scope: "PRODUCT", productIds: [pb.id], startsAt }).expect(400);
      await a.c.post(`/seller-organizations/${a.id}/promotions`).send({ name: "Platform-wide", discountType: "PERCENT", value: 10, scope: "SELLER", sellerOrganizationIds: [b.id], startsAt }).expect(400);
      const promo = await a.c.post(`/seller-organizations/${a.id}/promotions`).send({ name: "Spring", discountType: "PERCENT", value: 10, scope: "PRODUCT", productIds: [pa.id], startsAt }).expect(201);
      expect(promo.body.fundedBy).toBe("SELLER");
      expect(promo.body.status).toBe("DRAFT");

      await b.c.get(`/seller-organizations/${a.id}/promotions`).expect(403);
      await b.c.get(`/seller-organizations/${b.id}/promotions/${promo.body.id}`).expect(404);
      await b.c.post(`/seller-organizations/${b.id}/promotions/${promo.body.id}/status`).send({ status: "ACTIVE" }).expect(404);

      await a.c.post(`/seller-organizations/${a.id}/promotions/${promo.body.id}/status`).send({ status: "ACTIVE" }).expect(201);
      expect((await a.c.patch(`/seller-organizations/${a.id}/promotions/${promo.body.id}`).send({ value: 50 }).expect(409)).body.error.code).toBe("PROMOTION_INVALID_TRANSITION");
    });

    it("a seller that cannot fulfil cancels before dispatch and the customer is refunded; another seller cannot", async () => {
      const cu = await customer();
      const a = await seller();
      const b = await seller();
      const { variant } = await product();
      const o = await offer(a.id, variant.id, 350_000, 5);
      const { orderId } = await paidOrder(cu.c, cu.addressId, o.id, 2);

      await b.c.post(`/seller-organizations/${b.id}/orders/${orderId}/cancel`).send({ reason: "Not ours" }).expect(404);
      const refund = await a.c.post(`/seller-organizations/${a.id}/orders/${orderId}/cancel`).send({ reason: "Batch recalled by manufacturer" }).expect(201);
      expect(refund.body.status).toBe("SUCCEEDED");
      expect(refund.body.amount).toBe(700_000);
      const order = await cu.c.get(`/orders/${orderId}`).expect(200);
      expect(order.body.status).toBe("REFUNDED");
      expect(order.body.cancelReason).toBe("Batch recalled by manufacturer");
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).cancelledBy).toBe("SELLER");
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: o.id } })).onHand).toBe(5);
      await a.c.post(`/seller-organizations/${a.id}/orders/${orderId}/cancel`).send({ reason: "again" }).expect(409);
    });

    it("a seller cannot read another seller's order", async () => {
      const cu = await customer();
      const a = await seller();
      const b = await seller();
      const { variant } = await product();
      const o = await offer(a.id, variant.id, 100_000);
      const { orderId } = await paidOrder(cu.c, cu.addressId, o.id);
      await a.c.get(`/seller-organizations/${a.id}/orders/${orderId}`).expect(200);
      await b.c.get(`/seller-organizations/${b.id}/orders/${orderId}`).expect(404);
    });

    it("admin commerce is permission-gated and audited", async () => {
      const editor = await admin(AdminRole.EDITOR);
      await editor.c.get("/admin/commerce/orders").expect(403);

      const support = await admin(AdminRole.SUPPORT);
      await support.c.get("/admin/commerce/orders").expect(200);
      await support.c.get("/admin/commerce/analytics?days=7").expect(200);
      await support.c.post("/admin/commerce/promotions").send({ name: "x", discountType: "PERCENT", value: 5, scope: "ALL", startsAt: new Date().toISOString() }).expect(403);

      const ops = await admin(AdminRole.ADMIN);
      await ops.c.post("/admin/commerce/promotions").send({ name: "Too big", discountType: "PERCENT", value: 95, scope: "ALL", startsAt: new Date().toISOString() }).expect(400);
      await ops.c.post("/admin/commerce/promotions").send({ name: "Services", discountType: "PERCENT", value: 5, scope: "SERVICE", startsAt: new Date().toISOString() }).expect(400);
      const created = await ops.c.post("/admin/commerce/promotions").send({ name: `Yalda ${unique()}`, discountType: "FIXED", value: 50_000, scope: "ALL", startsAt: new Date().toISOString(), usageLimit: 100 }).expect(201);
      const live = await ops.c.post(`/admin/commerce/promotions/${created.body.id}/status`).send({ status: "ACTIVE" }).expect(201);
      expect(live.body.isLive).toBe(true);
      await ops.c.post(`/admin/commerce/promotions/${created.body.id}/status`).send({ status: "ENDED" }).expect(201);
      await ops.c.post(`/admin/commerce/promotions/${created.body.id}/status`).send({ status: "ACTIVE" }).expect(409);
      expect(await prisma.adminAuditLog.count({ where: { entityType: "PROMOTION", entityId: created.body.id } })).toBe(3);

      const { product: p } = await product();
      await support.c.patch(`/admin/commerce/products/${p.id}/status`).send({ status: "INACTIVE", reason: "Recall" }).expect(403);
      await ops.c.patch(`/admin/commerce/products/${p.id}/status`).send({ status: "INACTIVE", reason: "Manufacturer recall" }).expect(200);
      await request(server).get(`/shop/products/${p.id}`).expect(404);
    });
  });

  // -------------------------------------------------------------- address

  describe("address book", () => {
    it("validates Iranian postal codes and keeps exactly one default per household", async () => {
      const cu = await customer();
      await cu.c.post("/addresses").send({ householdId: cu.householdId, addressLine: "x", city: "Tehran", countryCode: "IR", postalCode: "12345" }).expect(400);
      const second = await cu.c.post("/addresses").send({ householdId: cu.householdId, addressLine: "Work", city: "Karaj", countryCode: "IR", isDefault: true }).expect(201);
      expect(second.body.isDefault).toBe(true);
      const list = await cu.c.get(`/addresses?householdId=${cu.householdId}`).expect(200);
      expect(list.body.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
      expect(list.body[0].id).toBe(second.body.id);
      await cu.c.patch(`/addresses/${cu.addressId}`).send({ isDefault: true }).expect(200);
      const again = await cu.c.get(`/addresses?householdId=${cu.householdId}`).expect(200);
      expect(again.body[0].id).toBe(cu.addressId);
      expect(again.body.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);

      const stranger = await customer();
      await stranger.c.patch(`/addresses/${cu.addressId}`).send({ label: "mine now" }).expect(403);
    });
  });
});
