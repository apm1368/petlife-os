import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, Prisma } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** P4 shop readiness (owner, 2026-11-13): every product that is not ready to sell, and why; strict and read-only. */
describe("admin incomplete-products queue", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const patch = (a: Actor, u: string) => request(server()).patch(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `aprd-${randomUUID()}@example.com` } });
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

  it("lists exactly the products that are not ready, with every reason, using the publish rule itself", async () => {
    const admin = await actor("Catalog Admin", AdminRole.ADMIN);
    const customer = await actor("Customer");
    const tag = randomUUID().slice(0, 8);
    const category = await db.productCategory.create({ data: { name: `Readiness ${tag}`, slug: `readiness-${tag}` } });
    const brand = await db.brand.create({ data: { name: `Brand ${tag}`, slug: `brand-${tag}` } });
    const shop = await db.sellerOrganization.create({ data: { name: `Ready Shop ${tag}`, countryCode: "IR", verificationStatus: "VERIFIED", status: "ACTIVE" } });
    const specs = [{ label: "Weight", value: "2 kg" }];

    async function product(title: string, data: Partial<Prisma.ProductUncheckedCreateInput>, images: Array<string | null>, offer?: { onHand: number; reserved?: number; moderation?: "APPROVED" | "PENDING_REVIEW" }) {
      const p = await db.product.create({ data: { categoryId: category.id, title: `${title} ${tag}`, slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${tag}`, allergenTags: [], ...data } });
      for (const [i, alt] of images.entries()) await db.productMedia.create({ data: { productId: p.id, url: `https://cdn.example/${p.id}/${i}.webp`, alt, sortOrder: i } });
      if (offer) {
        const v = await db.productVariant.create({ data: { productId: p.id, sku: `${p.slug}-v` } });
        await db.sellerOffer.create({ data: { sellerOrganizationId: shop.id, productVariantId: v.id, priceAmount: 500_000, status: "ACTIVE", moderationStatus: offer.moderation ?? "APPROVED", inventoryItem: { create: { onHand: offer.onHand, reserved: offer.reserved ?? 0 } } } });
      }
      return p;
    }

    const three = ["Front", "Back", "Label"];
    const ready = await product("Ready", { status: "ACTIVE", brandId: brand.id, specifications: specs }, three, { onHand: 5 });
    const twoImages = await product("Two images", { status: "ACTIVE", brandId: brand.id, specifications: specs }, ["Front", "Back"], { onHand: 5 });
    const noAlt = await product("No alt", { status: "INACTIVE", brandId: brand.id, specifications: specs }, ["Front", null, "  "], { onHand: 5 });
    const bare = await product("Bare", { status: "DRAFT" }, [], undefined);
    const soldOut = await product("Sold out", { status: "ACTIVE", brandId: brand.id, specifications: specs }, three, { onHand: 2, reserved: 2 });
    const pending = await product("Pending offer", { status: "ACTIVE", brandId: brand.id, specifications: specs }, three, { onHand: 9, moderation: "PENDING_REVIEW" });
    const archived = await product("Archived", { status: "ARCHIVED" }, [], undefined);
    const job = await db.catalogImportJob.create({ data: { targetCategoryId: category.id, idempotencyKey: `readiness-${tag}`, requestedById: admin.id } as never });
    const imported = await product("Imported", { status: "INACTIVE", brandId: brand.id, specifications: specs }, three, { onHand: 3 });
    await db.catalogImportItem.create({ data: { jobId: job.id, source: "DIGIKALA", sourceItemId: `dk-${tag}`, sourceUrl: `https://api.digikala.com/v2/product/${tag}/`, sourceSnapshot: {}, sourceHash: tag, productId: imported.id, status: "NEEDS_REVIEW" } });

    await get(customer, "/admin/commerce/product-readiness").expect(403);
    await get(admin, "/admin/commerce/product-readiness?issue=EVERYTHING").expect(400);
    await get(admin, "/admin/commerce/product-readiness?status=ARCHIVED").expect(400);

    const all = (await get(admin, `/admin/commerce/product-readiness?q=${tag}`).expect(200)).body;
    const byId = new Map(all.items.map((r: { id: string }) => [r.id, r]));
    expect(byId.has(ready.id)).toBe(false);
    expect(byId.has(archived.id)).toBe(false);
    expect(byId.get(twoImages.id)).toMatchObject({ issues: ["MEDIA_INCOMPLETE"], mediaCount: 2, meetsPublishRule: false, liveOffers: 1 });
    expect(byId.get(noAlt.id)).toMatchObject({ issues: ["MEDIA_INCOMPLETE"], mediaCount: 3, mediaWithoutAlt: 2, meetsPublishRule: false });
    expect(byId.get(bare.id)).toMatchObject({ issues: ["MEDIA_INCOMPLETE", "MISSING_BRAND", "MISSING_SPECS", "NO_LIVE_OFFER"], offers: 0 });
    expect(byId.get(soldOut.id)).toMatchObject({ issues: ["NO_LIVE_OFFER"], meetsPublishRule: true, offers: 1, liveOffers: 0 });
    expect(byId.get(pending.id)).toMatchObject({ issues: ["NO_LIVE_OFFER"], liveOffers: 0 });
    expect(byId.get(imported.id)).toMatchObject({ issues: ["UNREVIEWED_SOURCE"] });
    expect(all.total).toBe(6);
    expect(all.counts).toMatchObject({ ANY: 6, MEDIA_INCOMPLETE: 3, MISSING_BRAND: 1, MISSING_SPECS: 1, UNREVIEWED_SOURCE: 1, NO_LIVE_OFFER: 3 });
    // Public products with a problem come first.
    expect(all.items.slice(0, 3).every((r: { status: string }) => r.status === "ACTIVE")).toBe(true);

    const noOffer = (await get(admin, `/admin/commerce/product-readiness?q=${tag}&issue=NO_LIVE_OFFER`).expect(200)).body;
    expect(noOffer.items.map((r: { id: string }) => r.id).sort()).toEqual([bare.id, soldOut.id, pending.id].sort());
    expect(noOffer.total).toBe(3);
    const drafts = (await get(admin, `/admin/commerce/product-readiness?q=${tag}&status=DRAFT`).expect(200)).body;
    expect(drafts.items.map((r: { id: string }) => r.id)).toEqual([bare.id]);

    // The queue and the publish guard agree: what the queue calls MEDIA_INCOMPLETE cannot be activated.
    const blocked = await patch(admin, `/admin/commerce/products/${noAlt.id}/status`).send({ status: "ACTIVE", reason: "Ready to publish" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PRODUCT_MEDIA_INCOMPLETE");
  });
});
