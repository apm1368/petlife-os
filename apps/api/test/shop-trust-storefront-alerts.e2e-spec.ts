import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DomainEventsService } from "../src/common/events/domain-events.service";

type Actor = { id: string; csrf: string; cookie: string };

/** Public seller storefront, the product page's trust facts, and price-drop / back-in-stock alerts on favourites. */
describe("Shop trust, storefront and watchlist alerts (e2e)", () => {
  let app: INestApplication, db: PrismaService, events: DomainEventsService;
  const server = () => app.getHttpServer();
  const u = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    events = app.get(DomainEventsService);
  });
  afterAll(async () => app.close());

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `shop-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function sellerWithProduct(verified = true) {
    const slug = `paw-store-${u()}`;
    const seller = await db.sellerOrganization.create({ data: { name: `Paw Store ${u()}`, slug, city: "Tehran", description: "Food and toys", verificationStatus: verified ? SellerVerificationStatus.VERIFIED : SellerVerificationStatus.SUBMITTED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    const category = await db.productCategory.create({ data: { name: `Cat ${u()}`, slug: `cat-${u()}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `Kibble ${u()}`, slug: `kibble-${u()}`, status: "ACTIVE", supportsDog: true, supportsCat: false, allergenTags: [] } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `K-${u()}`, title: "2 kg" } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 1_000_000, currency: "IRR", status: "ACTIVE", moderationStatus: "APPROVED" } });
    const item = await db.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 0 } });
    return { seller, slug, product, offer, item };
  }

  it("shows a verified seller's storefront by slug or id, and hides unverified ones", async () => {
    const { seller, slug, product } = await sellerWithProduct();
    const bySlug = await request(server()).get(`/shop/sellers/${slug}`).expect(200);
    expect(bySlug.body.seller).toMatchObject({ id: seller.id, slug, name: seller.name, city: "Tehran", verified: true, rating: null });
    expect(JSON.stringify(bySlug.body)).not.toContain("supportContact");
    expect(bySlug.body.products.map((p: { id: string }) => p.id)).toContain(product.id);
    await request(server()).get(`/shop/sellers/${seller.id}`).expect(200);
    const hidden = await sellerWithProduct(false);
    await request(server()).get(`/shop/sellers/${hidden.slug}`).expect(404);
    await request(server()).get(`/shop/sellers/${encodeURIComponent("../etc")}`).expect(404);
  });

  it("puts the platform's real return window and seller links on the product page", async () => {
    const { product, slug } = await sellerWithProduct();
    const detail = await request(server()).get(`/shop/products/${product.id}`).expect(200);
    expect(detail.body.trust).toEqual({ returnWindowHours: 48, sellerRatings: {} });
    expect(detail.body.offers[0].sellerOrganization).toMatchObject({ slug });
  });

  it("tells members who saved a product when it gets cheaper or comes back, at most once a day each", async () => {
    const { product, offer, item } = await sellerWithProduct();
    const fan = await actor("Fan");
    const stranger = await actor("Stranger");
    await db.productFavorite.create({ data: { userId: fan.id, productId: product.id } });

    await events.publish("SellerOfferPriceChanged", { sellerOfferId: offer.id, fromPriceAmount: 1_000_000, toPriceAmount: 900_000 }, { aggregateType: "SellerOffer", aggregateId: offer.id });
    await events.publish("SellerOfferPriceChanged", { sellerOfferId: offer.id, fromPriceAmount: 900_000, toPriceAmount: 850_000 }, { aggregateType: "SellerOffer", aggregateId: offer.id });
    await events.publish("SellerOfferPriceChanged", { sellerOfferId: offer.id, fromPriceAmount: 850_000, toPriceAmount: 990_000 }, { aggregateType: "SellerOffer", aggregateId: offer.id });
    expect(await db.notification.count({ where: { userId: fan.id, type: "product.price_dropped", entityId: product.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: stranger.id, type: "product.price_dropped" } })).toBe(0);

    // 0 → 5 is back in stock; 5 → 8 is not.
    await events.publish("InventoryAdjusted", { inventoryItemId: item.id, delta: 5, quantityAfter: 5 }, { aggregateType: "InventoryItem", aggregateId: item.id });
    await events.publish("InventoryAdjusted", { inventoryItemId: item.id, delta: 3, quantityAfter: 8 }, { aggregateType: "InventoryItem", aggregateId: item.id });
    expect(await db.notification.count({ where: { userId: fan.id, type: "product.back_in_stock", entityId: product.id } })).toBe(1);
  });
});
