import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Admin Products (owner, 2026-11-13): one product with every seller's offer, price and stock, and the seller requests behind it. */
describe("admin product detail and seller request history", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `apd-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("shows each seller's offer with price, stock and whether it can be bought, plus the requests behind the product", async () => {
    const admin = await actor("Catalog Admin", AdminRole.ADMIN);
    const customer = await actor("Customer");
    const tag = randomUUID().slice(0, 8);
    const category = await db.productCategory.create({ data: { name: `Food ${tag}`, slug: `food-${tag}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `Kibble ${tag}`, slug: `kibble-${tag}`, allergenTags: [], status: "ACTIVE" } });
    const small = await db.productVariant.create({ data: { productId: product.id, sku: `kib-1-${tag}`, title: "1 kg" } });
    const large = await db.productVariant.create({ data: { productId: product.id, sku: `kib-5-${tag}`, title: "5 kg" } });
    const live = await db.sellerOrganization.create({ data: { name: `Live Shop ${tag}`, countryCode: "IR", verificationStatus: "VERIFIED", status: "ACTIVE" } });
    const suspended = await db.sellerOrganization.create({ data: { name: `Suspended Shop ${tag}`, countryCode: "IR", verificationStatus: "VERIFIED", status: "SUSPENDED" } });
    const pending = await db.sellerOrganization.create({ data: { name: `New Shop ${tag}`, countryCode: "IR", verificationStatus: "UNDER_REVIEW", status: "PENDING" } });

    const buyable = await db.sellerOffer.create({ data: { sellerOrganizationId: live.id, productVariantId: small.id, priceAmount: 900_000, status: "ACTIVE", moderationStatus: "APPROVED", inventoryItem: { create: { onHand: 10, reserved: 3 } } } });
    const soldOut = await db.sellerOffer.create({ data: { sellerOrganizationId: live.id, productVariantId: large.id, priceAmount: 4_000_000, status: "ACTIVE", moderationStatus: "APPROVED", inventoryItem: { create: { onHand: 2, reserved: 2 } } } });
    const shopDown = await db.sellerOffer.create({ data: { sellerOrganizationId: suspended.id, productVariantId: small.id, priceAmount: 800_000, status: "ACTIVE", moderationStatus: "APPROVED", inventoryItem: { create: { onHand: 5, reserved: 0 } } } });
    const awaiting = await db.sellerOffer.create({ data: { sellerOrganizationId: pending.id, productVariantId: small.id, priceAmount: 950_000, status: "PAUSED", moderationStatus: "PENDING_REVIEW" } });

    const requester = await actor("Shop Owner");
    const matched = await db.catalogProductRequest.create({ data: { sellerOrganizationId: pending.id, requestedByUserId: requester.id, requestedTitle: "Kibble one kilo", normalizedTitle: `kibble one kilo ${tag}`, status: "MATCHED_EXISTING", resolvedProductId: product.id, decisionReason: "Same product", reviewedAt: new Date() } });
    const waiting = await db.catalogProductRequest.create({ data: { sellerOrganizationId: live.id, requestedByUserId: requester.id, requestedTitle: `Brand new treat ${tag}`, normalizedTitle: `brand new treat ${tag}` } });
    const refused = await db.catalogProductRequest.create({ data: { sellerOrganizationId: live.id, requestedByUserId: requester.id, requestedTitle: `Counterfeit ${tag}`, normalizedTitle: `counterfeit ${tag}`, status: "REJECTED", decisionReason: "Not a pet product", reviewedAt: new Date(Date.now() + 1000) } });

    await get(customer, `/admin/commerce/products/${product.id}`).expect(403);
    await get(admin, `/admin/commerce/products/${randomUUID()}`).expect(404);
    await get(admin, "/admin/commerce/products/not-a-uuid").expect(400);

    const detail = (await get(admin, `/admin/commerce/products/${product.id}`).expect(200)).body;
    expect(detail).toMatchObject({ id: product.id, title: product.title, status: "ACTIVE", category: { id: category.id }, variantCount: 2, sellerCount: 3, lowestBuyablePrice: 900_000 });
    expect(detail.variants.map((v: { sku: string }) => v.sku)).toEqual([small.sku, large.sku]);
    const byId = new Map(detail.offers.map((o: { id: string }) => [o.id, o]));
    expect(byId.get(buyable.id)).toMatchObject({ seller: { name: live.name }, priceAmount: 900_000, stock: { onHand: 10, reserved: 3, available: 7 }, buyable: true });
    expect(byId.get(soldOut.id)).toMatchObject({ stock: { available: 0 }, buyable: false });
    expect(byId.get(shopDown.id)).toMatchObject({ seller: { status: "SUSPENDED" }, buyable: false });
    expect(byId.get(awaiting.id)).toMatchObject({ status: "PAUSED", moderationStatus: "PENDING_REVIEW", stock: null, buyable: false });
    expect(detail.catalogRequests).toEqual([expect.objectContaining({ id: matched.id, status: "MATCHED_EXISTING", sellerName: pending.name, decisionReason: "Same product" })]);

    // The request queue keeps its pending default; DECIDED is the history with who decided and the outcome.
    const pendingIds = (await get(admin, "/admin/commerce/catalog-product-requests").expect(200)).body.map((r: { id: string }) => r.id);
    expect(pendingIds).toContain(waiting.id);
    expect(pendingIds).not.toContain(refused.id);
    const decided = (await get(admin, "/admin/commerce/catalog-product-requests?status=DECIDED").expect(200)).body;
    const decidedIds = decided.map((r: { id: string }) => r.id);
    expect(decidedIds).toEqual(expect.arrayContaining([matched.id, refused.id]));
    expect(decidedIds).not.toContain(waiting.id);
    expect(decidedIds.indexOf(refused.id)).toBeLessThan(decidedIds.indexOf(matched.id));
    expect(decided.find((r: { id: string }) => r.id === matched.id)).toMatchObject({ resolvedProduct: { id: product.id, title: product.title }, duplicateCandidates: [] });
    await get(admin, "/admin/commerce/catalog-product-requests?status=EVERYTHING").expect(400);

    // Reading the detail changes nothing.
    expect(await db.sellerOffer.count({ where: { productVariant: { productId: product.id }, status: "ACTIVE" } })).toBe(3);
    await post(customer, `/admin/commerce/catalog-product-requests/${waiting.id}/reject`).send({ reason: "nope" }).expect(403);
  });
});
