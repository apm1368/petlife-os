import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { adminUserId: string; cookie: string; csrf: string };

/** Admin → Orders: every section's orders in one place, kept apart, with masked contacts and an audited export. */
describe("Admin Orders", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);

  async function admin(role: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: `orders ${role}`, email: `orders-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    const row = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { adminUserId: row.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("lists shop orders and bookings apart, masks contacts, scopes by role and exports with an audit row", async () => {
    const national = `912${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const phone = `+98${national}`;
    const buyer = await db.user.create({ data: { displayName: "Sara Buyer", email: `orders-b-${randomUUID()}@example.com`, phone } });
    const household = await db.household.create({ data: { name: "Buyer home", members: { create: { userId: buyer.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: household.id, name: "Milo", species: "CAT" } });

    // Shop order: one item, paid, shipped to Shiraz.
    const category = await db.productCategory.create({ data: { name: "Orders cat", slug: `orders-${randomUUID()}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: "Salmon kibble", slug: `kibble-${randomUUID()}`, allergenTags: [] } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `kib-${randomUUID()}`, title: "2 kg" } });
    const seller = await db.sellerOrganization.create({ data: { name: `Orders Seller ${randomUUID().slice(0, 5)}`, countryCode: "IR", verificationStatus: "VERIFIED", status: "ACTIVE" } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 450_000 } });
    const cart = await db.cart.create({ data: { userId: buyer.id } });
    const checkout = await db.checkout.create({ data: { userId: buyer.id, cartId: cart.id, deliveryMethod: "STANDARD", paymentMethodType: "ONLINE_PAYMENT", status: "CONFIRMED", subtotalAmount: 900_000, deliveryAmount: 60_000, discountAmount: 50_000, totalAmount: 910_000, currency: "IRR" } });
    await db.paymentIntent.create({ data: { checkoutId: checkout.id, amount: 910_000, currency: "IRR", status: "CAPTURED", provider: "DEV_SIMULATED" } });
    const order = await db.order.create({
      data: {
        checkoutId: checkout.id, userId: buyer.id, householdId: household.id, sellerOrganizationId: seller.id, status: "CONFIRMED",
        subtotalAmount: 900_000, deliveryAmount: 60_000, discountAmount: 50_000, totalAmount: 910_000, currency: "IRR",
        shippingAddressSnapshot: { addressLine: "12 Zand St", city: "Shiraz", region: "Fars", countryCode: "IR", recipient: "Sara", phone: `0${national}` },
        items: { create: { productId: product.id, productVariantId: variant.id, sellerOfferId: offer.id, productTitleSnapshot: "Salmon kibble", variantTitleSnapshot: "2 kg", skuSnapshot: "KIB-2", quantity: 2, unitPrice: 450_000, totalPrice: 900_000, compatibilitySnapshot: {} } },
      },
    });

    // Vet booking in Tabriz, created a moment later.
    const org = await db.providerOrganization.create({ data: { name: `Orders Clinic ${randomUUID().slice(0, 5)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Clinic road", city: "Tabriz", countryCode: "IR", timezone: "UTC" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const bookingNumber = `PL-B-${randomUUID().slice(0, 6).toUpperCase()}`;
    const booking = await db.booking.create({
      data: {
        householdId: household.id, petId: pet.id, userId: buyer.id, providerOrganizationId: org.id, providerLocationId: location.id, providerServiceId: service.id,
        category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 88_200_000), timezone: "UTC",
        bookingStatus: "CONFIRMED", bookingNumber, serviceNameSnapshot: "Checkup", priceAmount: 1_200_000, discountAmount: 0, paymentMode: "PAY_AT_PROVIDER", createdAt: new Date(Date.now() + 1000),
      },
    });

    const root = await admin(AdminRole.SUPER_ADMIN);
    const all = (await get(root, `/admin/orders?section=ALL&q=0${national}`).expect("Cache-Control", "no-store").expect(200)).body;
    expect(all.sections.map((s: { section: string }) => s.section)).toEqual(["SHOP", "SERVICES", "TRAVEL", "DONATIONS", "SUBSCRIPTIONS"]);
    expect(all.items.map((r: { id: string }) => r.id)).toEqual([booking.id, order.id]);
    const shopRow = all.items[1];
    expect(shopRow).toMatchObject({
      section: "SHOP", number: `PL-${order.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`, status: "CONFIRMED", stage: "OPEN",
      partner: { kind: "SELLER", id: seller.id, name: seller.name },
      items: [{ name: "Salmon kibble", variant: "2 kg", quantity: 2 }], itemCount: 1,
      customer: { userId: buyer.id, name: "Sara Buyer", anonymous: false },
      amounts: { subtotalIrr: 900_000, shippingIrr: 60_000, discountIrr: 50_000, totalIrr: 910_000 },
      payment: { state: "PAID", method: "ONLINE_PAYMENT", provider: "DEV_SIMULATED" }, city: "Shiraz",
    });
    expect(all.items[0]).toMatchObject({ section: "SERVICES", number: bookingNumber, partner: { name: org.name }, payment: { state: "ON_ARRIVAL" }, city: "Tabriz", amounts: { totalIrr: 1_200_000 } });
    expect(shopRow.customer.phoneMasked).toMatch(/^\+98\*+\d{2}$/);
    expect(JSON.stringify(all)).not.toContain(national);
    expect(all.canExport).toBe(true);
    expect(all.canRevealPii).toBe(true);

    // Order-number search, section tabs, filters and the cursor.
    const byNumber = (await get(root, `/admin/orders?section=SHOP&q=${shopRow.number.slice(0, 9)}`).expect(200)).body;
    expect(byNumber.items.map((r: { id: string }) => r.id)).toContain(order.id);
    expect((await get(root, `/admin/orders?section=SHOP&city=Tabriz&customerId=${buyer.id}`).expect(200)).body.items).toEqual([]);
    expect((await get(root, `/admin/orders?section=SERVICES&payment=ON_ARRIVAL&customerId=${buyer.id}`).expect(200)).body.items.map((r: { id: string }) => r.id)).toEqual([booking.id]);
    const first = (await get(root, `/admin/orders?customerId=${buyer.id}&limit=1`).expect(200)).body;
    expect(first.items.map((r: { id: string }) => r.id)).toEqual([booking.id]);
    const second = (await get(root, `/admin/orders?customerId=${buyer.id}&limit=1&before=${encodeURIComponent(first.nextCursor)}`).expect(200)).body;
    expect(second.items.map((r: { id: string }) => r.id)).toEqual([order.id]);
    expect(second.nextCursor).toBeNull();

    // Detail: items, payments and the delivery address with the recipient's phone masked.
    const detail = (await get(root, `/admin/orders/SHOP/${order.id}`).expect(200)).body;
    expect(detail.lines).toEqual([{ name: "Salmon kibble", variant: "2 kg", sku: "KIB-2", quantity: 2, unitPriceIrr: 450_000, totalIrr: 900_000 }]);
    expect(detail.payments[0]).toMatchObject({ status: "CAPTURED", amountIrr: 910_000 });
    expect(detail.address).toMatchObject({ line: "12 Zand St", city: "Shiraz", recipient: "Sara", phoneMasked: expect.stringMatching(/\*/) });
    expect(JSON.stringify(detail)).not.toContain(national);
    expect(detail.legacyHref).toBe(`/admin/commerce/orders/${order.id}`);
    await get(root, `/admin/orders/SHOP/${randomUUID()}`).expect(404);

    // Scope: a shop admin sees only the shop; an editor sees nothing; support may read but not export.
    const shopAdmin = await admin(AdminRole.SHOP_ADMIN);
    const shopOnly = (await get(shopAdmin, `/admin/orders?customerId=${buyer.id}`).expect(200)).body;
    expect(shopOnly.sections.map((s: { section: string }) => s.section)).toEqual(["SHOP"]);
    expect(shopOnly.items.map((r: { id: string }) => r.id)).toEqual([order.id]);
    expect(shopOnly.canExport).toBe(false);
    await get(shopAdmin, "/admin/orders?section=SERVICES").expect(403);
    await get(shopAdmin, `/admin/orders/SERVICES/${booking.id}`).expect(403);
    await get(await admin(AdminRole.EDITOR), "/admin/orders").expect(403);
    const support = await admin(AdminRole.SUPPORT);
    await get(support, `/admin/orders/export?customerId=${buyer.id}`).expect(403);

    // Export: CSV with masked phones and formula-safe cells, audited with the filters (not the search text).
    const ops = await admin(AdminRole.ADMIN);
    const res = await get(ops, `/admin/orders/export?customerId=${buyer.id}&q=0${national}`).expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="opetlife-orders-all-/);
    expect(res.text.startsWith("\uFEFFsection,number,created_at")).toBe(true);
    expect(res.text).toContain(shopRow.number);
    expect(res.text).toContain(bookingNumber);
    expect(res.text).not.toContain(national);
    const audit = await db.adminAuditLog.findFirstOrThrow({ where: { adminUserId: ops.adminUserId, action: "orders.exported" } });
    expect(audit.afterSummary).toMatchObject({ section: "ALL", rows: 2, truncated: false, filters: { customerId: buyer.id, search: "yes" } });
    expect(JSON.stringify(audit.afterSummary)).not.toContain(national);

    // A phone search is audited (that it happened, where, how many accounts matched), never the number itself.
    const searches = await db.adminAuditLog.findMany({ where: { adminUserId: root.adminUserId, action: "orders.phone_searched" } });
    expect(searches).toHaveLength(1);
    expect(searches[0]!.afterSummary).toEqual({ section: "ALL", purpose: "list", matchedAccounts: 1 });
    expect(JSON.stringify(searches)).not.toContain(national);

    // orders.export alone (no section to see) is refused rather than answered with an empty file.
    const exporterOnly = await admin(AdminRole.SUPPORT);
    const role = await db.adminCustomRole.create({ data: { name: `Exporter ${randomUUID().slice(0, 6)}`, permissions: ["orders.export"], verticals: [], createdByAdminId: root.adminUserId, updatedByAdminId: root.adminUserId } });
    await db.adminUser.update({ where: { id: exporterOnly.adminUserId }, data: { customRoleId: role.id } });
    await get(exporterOnly, "/admin/orders/export").expect(403);
    await get(exporterOnly, "/admin/orders").expect(403);
  });
});
