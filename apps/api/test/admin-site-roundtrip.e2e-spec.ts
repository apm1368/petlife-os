import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

type Client = { get: (u: string) => request.Test; put: (u: string) => request.Test; post: (u: string) => request.Test; patch: (u: string) => request.Test };

/**
 * Admin → API → site, end to end on the real API and a real (test) database: an admin reads a record, a role allowed
 * to edit changes it, the change is stored, and the public endpoint the site page uses returns the new value on a
 * fresh read. A role that may only view reads the same admin screen but is refused on edit, and the stored value is
 * untouched. A 2xx alone is never taken as proof: every step re-reads from the DB and from the public endpoint.
 *
 * Public endpoints are the ones the web pages call: /settings/public (PlatformAnnouncement), /blog/articles/:slug
 * (blog.service.getArticle), /places/:id (places.service.get), /shop/products/:id (commerce.service.getProductDetail).
 */
describe("Admin edits reach the site (real API + test DB)", () => {
  let app: INestApplication;
  let db: PrismaService;
  let csrf: string;
  const u = () => randomUUID().slice(0, 8);
  const anon = () => request(app.getHttpServer());

  async function admin(role: AdminRole): Promise<Client> {
    const user = await db.user.create({ data: { displayName: `admin ${role}`, email: `rt-${role.toLowerCase()}-${randomUUID()}@example.com` } });
    await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const s = () => app.getHttpServer();
    return {
      get: (p) => request(s()).get(p).set("Cookie", cookie),
      put: (p) => request(s()).put(p).set("Cookie", cookie).set("x-csrf-token", csrf),
      post: (p) => request(s()).post(p).set("Cookie", cookie).set("x-csrf-token", csrf),
      patch: (p) => request(s()).patch(p).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await anon().get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  });
  afterAll(async () => {
    await db.platformSetting.deleteMany({ where: { key: "platform.announcement" } });
    await app?.close();
  });

  it("platform announcement: ADMIN edits it, the public banner shows it; OPERATIONS (settings.view only) reads but can't edit", async () => {
    const editor = await admin(AdminRole.ADMIN);
    const viewer = await admin(AdminRole.OPERATIONS);
    const current = (await editor.get("/admin/settings").expect(200)).body.find((s: { key: string }) => s.key === "platform.announcement");
    expect((await viewer.get("/admin/settings").expect(200)).body.some((s: { key: string }) => s.key === "platform.announcement")).toBe(true);

    const text = { fa: `اطلاعیهٔ آزمون ${u()}`, en: `Test notice ${u()}` };
    const refused = await viewer.put("/admin/settings/platform.announcement").send({ value: text, baseVersion: current.version, reason: "view role must not edit" }).expect(403);
    expect(refused.body.error.code).toBeTruthy();
    expect((await anon().get("/settings/public").expect(200)).body["platform.announcement"]).not.toEqual(text);

    await editor.put("/admin/settings/platform.announcement").send({ value: text, baseVersion: current.version, reason: "round-trip check" }).expect(200);
    expect((await db.platformSetting.findUniqueOrThrow({ where: { key: "platform.announcement" } })).value).toEqual(text);
    expect((await anon().get("/settings/public").expect(200)).body["platform.announcement"]).toEqual(text);
    // A stale editor (old baseVersion) gets an explicit conflict, never a silent overwrite.
    const stale = await editor.put("/admin/settings/platform.announcement").send({ value: null, baseVersion: current.version, reason: "stale draft" }).expect(409);
    expect(stale.body.error.code).toBe("SETTING_CHANGE_CONFLICT");
    expect((await anon().get("/settings/public").expect(200)).body["platform.announcement"]).toEqual(text);
  });

  it("blog article: live text changes only through a publisher; an editor's edit of a published article is refused, view-only can't edit", async () => {
    const editor = await admin(AdminRole.EDITOR);
    const publisher = await admin(AdminRole.ADMIN);
    const viewer = await admin(AdminRole.READ_ONLY);
    const slug = `rt-${u()}`;
    const para = (text: string) => [{ type: "paragraph", content: [{ text }] }];
    const created = (await editor.post("/admin/content/articles").send({ locale: "fa", title: "عنوان اول", slug, body: para("متن اول") }).expect(201)).body;
    await publisher.post(`/admin/content/articles/${created.id}/locales/fa/publish`).expect(201);
    expect((await anon().get(`/blog/articles/${slug}?locale=fa`).expect(200)).body.title).toBe("عنوان اول");

    // View-only reads the article in admin but can't edit it.
    await viewer.get(`/admin/content/articles/${created.id}`).expect(200);
    await viewer.put(`/admin/content/articles/${created.id}/locales/fa`).send({ title: "نفوذی", slug, body: para("x") }).expect(403);

    // An editor (content.edit, no content.publish) can't rewrite what is live: the site keeps the published text.
    const refused = await editor.put(`/admin/content/articles/${created.id}/locales/fa`).send({ title: "ویرایش زندهٔ ویراستار", slug, body: para("متن ویراستار") }).expect(403);
    expect(refused.body.error.details.reason).toBe("LIVE_EDIT_REQUIRES_CONTENT_PUBLISH");
    expect((await anon().get(`/blog/articles/${slug}?locale=fa`).expect(200)).body.title).toBe("عنوان اول");
    expect((await db.articleLocale.findFirstOrThrow({ where: { articleId: created.id, locale: "fa" } })).title).toBe("عنوان اول");

    // A publisher's edit of the live article is live at once, with a recoverable version.
    await publisher.put(`/admin/content/articles/${created.id}/locales/fa`).send({ title: "عنوان دوم", slug, body: para("متن دوم"), changeNote: "publisher live fix" }).expect(200);
    const live = (await anon().get(`/blog/articles/${slug}?locale=fa`).expect(200)).body;
    expect(live.title).toBe("عنوان دوم");
    expect(JSON.stringify(live.body)).toContain("متن دوم");
    expect(await db.contentVersion.count({ where: { articleId: created.id, locale: "fa" } })).toBeGreaterThanOrEqual(2);

    // The editor's path: the publisher hides it, the editor edits it offline, the publisher puts it back live.
    await publisher.post(`/admin/content/articles/${created.id}/locales/fa/hide`).expect(201);
    await anon().get(`/blog/articles/${slug}?locale=fa`).expect(404);
    await editor.put(`/admin/content/articles/${created.id}/locales/fa`).send({ title: "عنوان سوم", slug, body: para("متن سوم") }).expect(200);
    await anon().get(`/blog/articles/${slug}?locale=fa`).expect(404);
    await publisher.post(`/admin/content/articles/${created.id}/locales/fa/publish`).expect(201);
    expect((await anon().get(`/blog/articles/${slug}?locale=fa`).expect(200)).body.title).toBe("عنوان سوم");
  });

  it("place: OPERATIONS renames a listed place and the public place page shows it; READ_ONLY (places.view) can't", async () => {
    const ops = await admin(AdminRole.OPERATIONS);
    const viewer = await admin(AdminRole.READ_ONLY);
    const place = (await ops.post("/admin/places").send({ name: `Park ${u()}`, category: "PARK", country: "IR", city: "Tehran", latitude: 35.7, longitude: 51.4 }).expect(201)).body;
    await ops.post(`/admin/places/${place.id}/verification`).send({ status: "VERIFIED" }).expect(201);
    await ops.post(`/admin/places/${place.id}/listing`).send({ isPubliclyListed: true }).expect(201);

    const renamed = `Renamed park ${u()}`;
    await viewer.get(`/admin/places/${place.id}`).expect(200);
    await viewer.patch(`/admin/places/${place.id}`).send({ name: "Viewer edit" }).expect(403);
    await ops.patch(`/admin/places/${place.id}`).send({ name: renamed }).expect(200);
    expect((await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: place.id } })).name).toBe(renamed);
    expect((await anon().get(`/places/${place.id}`).expect(200)).body.name).toBe(renamed);
    expect((await ops.get(`/admin/places/${place.id}`).expect(200)).body.name).toBe(renamed);
  });

  it("product: COMMERCE_OPERATIONS deactivates a product and the shop page stops serving it; FINANCE (commerce.view) can't", async () => {
    const ops = await admin(AdminRole.COMMERCE_OPERATIONS);
    const viewer = await admin(AdminRole.FINANCE);
    const seller = await db.sellerOrganization.create({ data: { name: `RT seller ${u()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    const category = await db.productCategory.create({ data: { name: `RT cat ${u()}`, slug: `rt-cat-${u()}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `RT product ${u()}`, slug: `rt-product-${u()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `RT-${u()}` } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 250_000, currency: "IRR" } });
    await db.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 5 } });
    await anon().get(`/shop/products/${product.id}`).expect(200);

    await viewer.get("/admin/commerce/products").expect(200);
    await viewer.patch(`/admin/commerce/products/${product.id}/status`).send({ status: "INACTIVE", reason: "viewer must not" }).expect(403);
    await anon().get(`/shop/products/${product.id}`).expect(200);

    await ops.patch(`/admin/commerce/products/${product.id}/status`).send({ status: "INACTIVE", reason: "Round-trip recall check" }).expect(200);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe("INACTIVE");
    await anon().get(`/shop/products/${product.id}`).expect(404);
    await ops.patch(`/admin/commerce/products/${product.id}/status`).send({ status: "ACTIVE", reason: "Recall lifted after check" }).expect(200);
    const back = (await anon().get(`/shop/products/${product.id}`).expect(200)).body;
    expect(back.id ?? back.product?.id).toBe(product.id);
  });
});
