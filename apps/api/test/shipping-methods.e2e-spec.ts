import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus, ShippingProvider } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies { session?: string; csrf?: string }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

describe("Shipping methods, seller profiles and the address book (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    // Leave other suites with the default methods (staff-run ones off).
    await prisma.shippingMethodSetting.deleteMany({});
    await app.close();
  });
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  async function session(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const verified = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code: otp(logSpy, identifier) }).expect(200);
    return { session: extractCookie(verified.headers["set-cookie"], "petlife_session"), csrf };
  }
  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (path: string) => request(server).get(path).set("Cookie", cookie),
      post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (path: string) => request(server).put(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (path: string) => request(server).patch(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (path: string) => request(server).delete(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  async function signedIn(prefix: string) {
    const email = `${prefix}-${unique()}@example.com`;
    const c = client(await session(email));
    return { c, user: await prisma.user.findUniqueOrThrow({ where: { email } }) };
  }
  async function admin(role: AdminRole) {
    const a = await signedIn(`ship-admin-${role.toLowerCase()}`);
    await prisma.adminUser.create({ data: { userId: a.user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return a.c;
  }
  async function sellerWithOffer() {
    const owner = await signedIn("ship-seller");
    const seller = await prisma.sellerOrganization.create({ data: { name: `Ship seller ${unique()}`, city: "تهران", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: owner.user.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    const category = await prisma.productCategory.create({ data: { name: `Ship category ${unique()}`, slug: `ship-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: "Ship test product", slug: `ship-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `SHIP-${unique()}`, title: "One", weightValue: 2.5, weightUnit: "KG" } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 1_000_000, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 5 } });
    return { owner, seller, offer };
  }

  it("lets staff price Post Pishtaz and the opetlife courier, and only usable methods reach checkout", async () => {
    const commerce = await admin(AdminRole.SUPER_ADMIN);
    const support = await admin(AdminRole.SUPPORT);
    await support.put("/admin/shipping/methods/POST_PISHTAZ").send({ enabled: true, config: { fixedPriceIrr: 750_000 } }).expect(403);
    // Switching a method on without a price is refused.
    await commerce.put("/admin/shipping/methods/POST_PISHTAZ").send({ enabled: true, config: {} }).expect(400);
    await commerce.put("/admin/shipping/methods/POST_PISHTAZ").send({ enabled: true, config: { fixedPriceIrr: 750_000, includedKg: 1, perExtraKgIrr: 100_000, etaDaysMin: 2, etaDaysMax: 4 }, reason: "Post tariff 1405" }).expect(200);
    const overview = await commerce.put("/admin/shipping/methods/OPETLIFE_COURIER").send({ enabled: true, config: { cities: ["تهران"], defaultFlatFareIrr: 900_000 } }).expect(200);
    expect(overview.body.methods.find((m: { provider: string }) => m.provider === "POST_PISHTAZ")).toMatchObject({ active: true, kind: "MANUAL" });
    expect(await prisma.adminAuditLog.count({ where: { action: "shipping_method.updated" } })).toBeGreaterThanOrEqual(2);

    const { owner, seller, offer } = await sellerWithOffer();
    const buyer = await signedIn("ship-buyer");
    const household = await buyer.c.post("/households").send({}).expect(201);
    const address = await buyer.c.post("/addresses").send({ householdId: household.body.id, addressLine: "خیابان ولیعصر", city: "تهران", area: "ونک", countryCode: "IR", postalCode: "1234567890" }).expect(201);
    expect(address.body.area).toBe("ونک");
    await buyer.c.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyer.c.post("/checkout").send({ addressId: address.body.id }).expect(201);

    const quotes = (await buyer.c.get(`/checkout/${checkout.body.id}/shipping-quotes`).expect(200)).body[0].quotes as { provider: string; priceIrr: number; pricingBasis: string }[];
    // 2.5 kg: fixed price + 2 started kilos above the included one.
    expect(quotes.find((q) => q.provider === "POST_PISHTAZ")).toMatchObject({ priceIrr: 950_000, pricingBasis: "FIXED_PRICE" });
    expect(quotes.find((q) => q.provider === "OPETLIFE_COURIER")).toMatchObject({ priceIrr: 900_000, pricingBasis: "CITY_FLAT" });
    expect(quotes.filter((q) => q.provider === "ALOPEYK").every((q) => q.pricingBasis === "SANDBOX_ESTIMATE")).toBe(true);

    // The seller narrows its methods to Post only; a refresh then quotes nothing else.
    await owner.c.put(`/seller-organizations/${seller.id}/shipping-profile`).send({ offeredProviders: ["POST_PISHTAZ"], addressLine: "بازار", city: "تهران", phone: "02100000000" }).expect(200);
    const profile = (await owner.c.get(`/seller-organizations/${seller.id}/shipping-profile`).expect(200)).body;
    expect(profile).toMatchObject({ offeredProviders: ["POST_PISHTAZ"], pickup: { addressLine: "بازار", city: "تهران" } });
    expect(profile.availableProviders).toEqual(expect.arrayContaining(["POST_PISHTAZ", "OPETLIFE_COURIER"]));
    const intruder = await buyer.c.put(`/seller-organizations/${seller.id}/shipping-profile`).send({ offeredProviders: [] });
    expect([403, 404]).toContain(intruder.status);
    const refreshed = (await buyer.c.post(`/checkout/${checkout.body.id}/shipping-quotes/refresh`).expect(201)).body[0].quotes as { provider: string; status: string }[];
    expect([...new Set(refreshed.filter((q) => q.status === "AVAILABLE").map((q) => q.provider))]).toEqual(["POST_PISHTAZ"]);
  });

  it("moves a staff-run shipment only through admin, records it on the timeline, and refuses API couriers", async () => {
    const commerce = await admin(AdminRole.SUPER_ADMIN);
    const viewer = await admin(AdminRole.SUPPORT);
    const { seller } = await sellerWithOffer();
    const buyer = await signedIn("ship-track");
    const household = await prisma.household.create({ data: { name: "h", members: { create: { userId: buyer.user.id, role: "OWNER" } } } });
    const order = await prisma.order.create({ data: { userId: buyer.user.id, householdId: household.id, sellerOrganizationId: seller.id, subtotalAmount: 1, deliveryAmount: 0, discountAmount: 0, totalAmount: 1, currency: "IRR", shippingAddressSnapshot: { city: "تهران" } } });
    const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, sellerOrgId: seller.id, status: "PICKUP_REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: { city: "تهران" } } });
    const post = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: ShippingProvider.POST_PISHTAZ, providerShipmentId: `post-${unique()}`, status: "REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: {} } });

    await viewer.post(`/admin/shipping/shipments/${post.id}/status`).send({ status: "IN_TRANSIT", trackingCode: "123456789012345678" }).expect(403);
    await commerce.post(`/admin/shipping/shipments/${post.id}/status`).send({ status: "IN_TRANSIT", trackingCode: "123456789012345678" }).expect(201);
    const updated = await prisma.shipment.findUniqueOrThrow({ where: { id: post.id } });
    expect(updated).toMatchObject({ status: "IN_TRANSIT", trackingCode: "123456789012345678" });
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: post.id, eventType: "shipment.staff_update" } })).toBe(1);
    const list = (await viewer.get("/admin/shipping/shipments?provider=POST_PISHTAZ").expect(200)).body.items as { id: string; staffManaged: boolean }[];
    expect(list.find((s) => s.id === post.id)).toMatchObject({ staffManaged: true });

    const fulfillment2 = await prisma.fulfillment.create({ data: { orderId: order.id, sequenceNumber: 2, sellerOrgId: seller.id, status: "PICKUP_REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: {} } });
    const api = await prisma.shipment.create({ data: { fulfillmentId: fulfillment2.id, provider: ShippingProvider.ALOPEYK, providerShipmentId: `alo-${unique()}`, status: "REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: {} } });
    await commerce.post(`/admin/shipping/shipments/${api.id}/status`).send({ status: "DELIVERED" }).expect(400);
  });

  it("offers Snappbox booked in the app at opetlife's estimate, and lets staff share its https tracking link", async () => {
    const commerce = await admin(AdminRole.SUPER_ADMIN);
    // Like opetlife's own courier: no price, no switch-on.
    await commerce.put("/admin/shipping/methods/SNAPPBOX_APP").send({ enabled: true, config: {} }).expect(400);
    const overview = await commerce.put("/admin/shipping/methods/SNAPPBOX_APP").send({ enabled: true, config: { cities: ["تهران"], defaultFlatFareIrr: 1_100_000 }, reason: "Snappbox app rates" }).expect(200);
    expect(overview.body.methods.find((m: { provider: string }) => m.provider === "SNAPPBOX_APP")).toMatchObject({ active: true, kind: "MANUAL" });

    const { seller, offer } = await sellerWithOffer();
    const buyer = await signedIn("ship-app");
    const household = await buyer.c.post("/households").send({}).expect(201);
    const address = await buyer.c.post("/addresses").send({ householdId: household.body.id, addressLine: "خیابان آزادی", city: "تهران", countryCode: "IR", postalCode: "1234567891" }).expect(201);
    await buyer.c.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyer.c.post("/checkout").send({ addressId: address.body.id }).expect(201);
    const quotes = (await buyer.c.get(`/checkout/${checkout.body.id}/shipping-quotes`).expect(200)).body[0].quotes as { provider: string; priceIrr: number; pricingBasis: string }[];
    expect(quotes.find((q) => q.provider === "SNAPPBOX_APP")).toMatchObject({ priceIrr: 1_100_000, pricingBasis: "CITY_FLAT" });

    const order = await prisma.order.create({ data: { userId: buyer.user.id, householdId: household.body.id, sellerOrganizationId: seller.id, subtotalAmount: 1, deliveryAmount: 0, discountAmount: 0, totalAmount: 1, currency: "IRR", shippingAddressSnapshot: { city: "تهران" } } });
    const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, sellerOrgId: seller.id, status: "PICKUP_REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: { city: "تهران" } } });
    const shipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: ShippingProvider.SNAPPBOX_APP, providerShipmentId: `snappbox-app-${unique()}`, status: "REQUESTED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: {} } });
    await commerce.post(`/admin/shipping/shipments/${shipment.id}/status`).send({ status: "ASSIGNED", trackingCode: "javascript:alert(1)" }).expect(400);
    const link = "https://example.com/track/snappbox-job-1234567890";
    await commerce.post(`/admin/shipping/shipments/${shipment.id}/status`).send({ status: "ASSIGNED", trackingCode: link }).expect(201);
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({ status: "ASSIGNED", trackingCode: link });
  });

  it("binds a quote to the address it priced: an edited or switched address needs a fresh quote", async () => {
    const commerce = await admin(AdminRole.SUPER_ADMIN);
    await commerce.put("/admin/shipping/methods/OPETLIFE_COURIER").send({ enabled: true, config: { cities: ["تهران"], defaultFlatFareIrr: 900_000 } }).expect(200);
    const { offer } = await sellerWithOffer();
    const buyer = await signedIn("ship-bind");
    const household = await buyer.c.post("/households").send({}).expect(201);
    const near = await buyer.c.post("/addresses").send({ householdId: household.body.id, addressLine: "خیابان شریعتی", city: "تهران", countryCode: "IR", postalCode: "1234567892" }).expect(201);
    const other = await buyer.c.post("/addresses").send({ householdId: household.body.id, addressLine: "خیابان انقلاب", city: "تهران", countryCode: "IR", postalCode: "1234567893" }).expect(201);
    await buyer.c.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyer.c.post("/checkout").send({ addressId: near.body.id }).expect(201);
    const quoteFor = async () => ((await buyer.c.get(`/checkout/${checkout.body.id}/shipping-quotes`).expect(200)).body[0].quotes as { id: string; provider: string; status: string }[]).find((q) => q.provider === "OPETLIFE_COURIER" && q.status === "AVAILABLE")!;
    const first = await quoteFor();
    await buyer.c.post(`/checkout/${checkout.body.id}/shipping-quotes/select`).send({ quoteId: first.id }).expect(201);

    // Editing the saved address after choosing: payment refuses the old quote.
    await buyer.c.patch(`/addresses/${near.body.id}`).send({ addressLine: "خیابان شریعتی، کوچهٔ دیگر" }).expect(200);
    const refused = await buyer.c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(410);
    expect(refused.body.error.code).toBe("SHIPPING_QUOTE_EXPIRED");

    // Switching the checkout to another address: a quote priced for the first one can't be chosen.
    const second = await quoteFor();
    await buyer.c.patch(`/checkout/${checkout.body.id}`).send({ addressId: other.body.id }).expect(200);
    await buyer.c.post(`/checkout/${checkout.body.id}/shipping-quotes/select`).send({ quoteId: second.id }).expect(410);
    const fresh = await quoteFor();
    expect(fresh.id).not.toBe(second.id);
    await buyer.c.post(`/checkout/${checkout.body.id}/shipping-quotes/select`).send({ quoteId: fresh.id }).expect(201);
    await buyer.c.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: checkout.body.id } })).deliveryAddressSnapshot).toMatchObject({ addressLine: "خیابان انقلاب" });
  });

  it("archives an address, hands the default to the next one, and keeps it out of checkout", async () => {
    const member = await signedIn("ship-book");
    const household = await member.c.post("/households").send({}).expect(201);
    const first = await member.c.post("/addresses").send({ householdId: household.body.id, addressLine: "اول", city: "تهران", countryCode: "IR" }).expect(201);
    const second = await member.c.post("/addresses").send({ householdId: household.body.id, addressLine: "دوم", city: "تهران", countryCode: "IR", latitude: 35.75, longitude: 51.41 }).expect(201);
    expect(first.body.isDefault).toBe(true);
    const stranger = await signedIn("ship-stranger");
    await stranger.c.delete(`/addresses/${first.body.id}`).expect(403);
    const archived = await member.c.delete(`/addresses/${first.body.id}`).expect(200);
    expect(archived.body).toEqual({ archived: true, newDefaultId: second.body.id });
    const list = (await member.c.get(`/addresses?householdId=${household.body.id}`).expect(200)).body as { id: string; isDefault: boolean }[];
    expect(list).toEqual([expect.objectContaining({ id: second.body.id, isDefault: true })]);
    await member.c.patch(`/addresses/${first.body.id}`).send({ label: "x" }).expect(404);
  });
});
