import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * CartLineDto.imageUrl: the line's own variant image if it has one, else the product's first image, else null —
 * never an invented placeholder. Prices and currency are untouched by the field.
 */
describe("Cart line image", () => {
  let app: INestApplication;
  let db: PrismaService;
  let cookie: string, csrf: string;
  const u = () => randomUUID().slice(0, 8);

  const get = (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie);
  const post = (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf);

  async function variantWithOffer(sellerId: string, productId: string, title: string) {
    const variant = await db.productVariant.create({ data: { productId, sku: `CLI-${u()}`, title } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variant.id, priceAmount: 500_000, currency: "IRR" } });
    await db.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
    return { variant, offer };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const user = await db.user.create({ data: { displayName: "Shopper", email: `cli-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
  });
  afterAll(async () => { await app?.close(); });

  it("prefers the variant's image, falls back to the product's first image, and is null without media", async () => {
    const seller = await db.sellerOrganization.create({ data: { name: `CLI Seller ${u()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    const category = await db.productCategory.create({ data: { name: `CLI Cat ${u()}`, slug: `cli-cat-${u()}` } });
    const mk = (title: string) => db.product.create({ data: { categoryId: category.id, title, slug: `cli-${u()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const withMedia = await mk("With media");
    const bare = await mk("No media");

    const small = await variantWithOffer(seller.id, withMedia.id, "2 kg");
    const large = await variantWithOffer(seller.id, withMedia.id, "10 kg");
    const plain = await variantWithOffer(seller.id, bare.id, "1 pc");
    await db.productMedia.createMany({
      data: [
        { productId: withMedia.id, url: "/images/products/second.jpg", sortOrder: 2 },
        { productId: withMedia.id, url: "/images/products/first.jpg", sortOrder: 1 },
        { productId: withMedia.id, variantId: large.variant.id, url: "/images/products/large.jpg", sortOrder: 5 },
      ],
    });

    for (const o of [small.offer, large.offer, plain.offer]) await post("/cart/items").send({ offerId: o.id, quantity: 1 }).expect(201);
    const cart = (await get("/cart").expect(200)).body;
    const lines = cart.sellerGroups.flatMap((g: { lines: Array<{ sellerOffer: { id: string }; imageUrl: string | null; currentPriceAmount: number; currency: string }> }) => g.lines);
    const byOffer = new Map(lines.map((l: { sellerOffer: { id: string } }) => [l.sellerOffer.id, l]));

    expect((byOffer.get(large.offer.id) as { imageUrl: string }).imageUrl).toBe("/images/products/large.jpg");
    expect((byOffer.get(small.offer.id) as { imageUrl: string }).imageUrl).toBe("/images/products/first.jpg");
    expect((byOffer.get(plain.offer.id) as { imageUrl: string | null }).imageUrl).toBeNull();
    for (const l of lines) expect(l).toMatchObject({ currentPriceAmount: 500_000, currency: "IRR" });
  });
});
