import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { createTestApp, extractCookie } from "./test-app";

interface Cookies {
  session?: string;
  csrf?: string;
}

function otpFromLog(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find(
    (args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier),
  );
  const code = typeof call?.[0] === "string" ? /code=(\d+)/.exec(call[0])?.[1] : undefined;
  if (!code) throw new Error("OTP was not logged");
  return code;
}

describe("Product media administration", () => {
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

  afterAll(async () => app.close());

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  async function signIn(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf");
    await request(server)
      .post("/auth/request-otp")
      .set("Cookie", `petlife_csrf=${csrf}`)
      .set("x-csrf-token", csrf!)
      .send({ identifier })
      .expect(200);
    const verify = await request(server)
      .post("/auth/verify-otp")
      .set("Cookie", `petlife_csrf=${csrf}`)
      .set("x-csrf-token", csrf!)
      .send({ identifier, code: otpFromLog(logSpy, identifier) })
      .expect(200);
    return { session: extractCookie(verify.headers["set-cookie"], "petlife_session"), csrf };
  }

  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (url: string) => request(server).get(url).set("Cookie", cookie),
      post: (url: string) =>
        request(server).post(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (url: string) =>
        request(server).patch(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (url: string) => request(server).put(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (url: string) =>
        request(server).delete(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }

  async function commerceAdmin() {
    const identifier = `product-media-admin-${unique()}@example.com`;
    const c = client(await signIn(identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({
      data: { userId: user.id, role: AdminRole.COMMERCE_OPERATIONS, status: AdminMembershipStatus.ACTIVE },
    });
    return c;
  }

  async function product() {
    const category = await prisma.productCategory.create({
      data: { name: `Media category ${unique()}`, slug: `media-category-${unique()}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        title: `Media product ${unique()}`,
        slug: `media-product-${unique()}`,
        supportsDog: true,
        supportsCat: true,
        allergenTags: [],
        status: "INACTIVE",
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `MEDIA-${unique()}` },
    });
    return { product, variant, category };
  }

  /** A real 1×1 PNG: uploads under an image key must be an image (arbitrary bytes are refused with 415). */
  const tinyPng = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

  async function uploadedTarget(c: ReturnType<typeof client>, productId: string) {
    const target = await c
      .post(`/admin/commerce/products/${productId}/media/upload-url`)
      .send({ contentType: "image/png", fileSizeBytes: tinyPng.length })
      .expect(201);
    const path = new URL(target.body.uploadUrl).pathname;
    await request(server)
      .put(path)
      .set("Content-Type", "image/png")
      .send(tinyPng)
      .expect(200);
    return target.body as { key: string };
  }

  it("uses a product-scoped direct upload, records three ordered images and audits every mutation", async () => {
    const c = await commerceAdmin();
    const { product: p, variant, category } = await product();

    await c
      .post("/admin/commerce/products")
      .send({
        categoryId: category.id,
        title: "Product cannot be public before gallery upload",
        slug: `not-public-yet-${unique()}`,
        sku: `NOT-PUBLIC-${unique()}`,
        status: "ACTIVE",
      })
      .expect(409);
    await c
      .patch(`/admin/commerce/products/${p.id}/status`)
      .send({ status: "ACTIVE", reason: "Ready to publish" })
      .expect(409);
    await c
      .post(`/admin/commerce/products/${p.id}/media`)
      .send({
        objectKey:
          "product-media/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000.png",
        alt: "Not this product",
      })
      .expect(400);

    const created: { id: string; sortOrder: number }[] = [];
    for (const [index, alt] of [
      "Front of the product package",
      "Ingredients and nutrition panel",
      "Product size next to a hand",
    ].entries()) {
      const target = await uploadedTarget(c, p.id);
      const response = await c
        .post(`/admin/commerce/products/${p.id}/media`)
        .send({ objectKey: target.key, alt, ...(index === 0 ? { variantId: variant.id } : {}) })
        .expect(201);
      created.push(response.body);
    }

    const listed = await c.get(`/admin/commerce/products/${p.id}/media`).expect(200);
    expect(listed.body).toHaveLength(3);
    expect(listed.body.map((item: { alt: string }) => item.alt)).toEqual([
      "Front of the product package",
      "Ingredients and nutrition panel",
      "Product size next to a hand",
    ]);
    expect(listed.body[0].variantId).toBe(variant.id);

    await c
      .post(`/admin/commerce/products/${p.id}/media/upload-url`)
      .send({ contentType: "image/png", fileSizeBytes: 4 })
      .expect(409);
    const reordered = await c
      .put(`/admin/commerce/products/${p.id}/media/order`)
      .send({ mediaIds: [created[2]!.id, created[0]!.id, created[1]!.id] })
      .expect(200);
    expect(reordered.body.map((item: { id: string }) => item.id)).toEqual([
      created[2]!.id,
      created[0]!.id,
      created[1]!.id,
    ]);

    await c
      .patch(`/admin/commerce/products/${p.id}/status`)
      .send({ status: "ACTIVE", reason: "Gallery is complete" })
      .expect(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ACTIVE");
    expect(
      await prisma.adminAuditLog.count({
        where: {
          entityType: "PRODUCT",
          entityId: p.id,
          action: { in: ["product.media_added", "product.media_reordered", "product.status_changed"] },
        },
      }),
    ).toBe(5);
  });

  it("does not let a commerce viewer mutate gallery media and keeps product status incomplete after removal", async () => {
    const viewerIdentifier = `product-media-viewer-${unique()}@example.com`;
    const viewer = client(await signIn(viewerIdentifier));
    const viewerUser = await prisma.user.findUniqueOrThrow({ where: { email: viewerIdentifier } });
    await prisma.adminUser.create({
      data: { userId: viewerUser.id, role: AdminRole.FINANCE, status: AdminMembershipStatus.ACTIVE },
    });
    const manager = await commerceAdmin();
    const { product: p } = await product();

    await viewer
      .post(`/admin/commerce/products/${p.id}/media/upload-url`)
      .send({ contentType: "image/png", fileSizeBytes: 4 })
      .expect(403);

    const ids: string[] = [];
    for (const alt of ["First product view", "Second product view", "Third product view"]) {
      const target = await uploadedTarget(manager, p.id);
      const confirmed = await manager
        .post(`/admin/commerce/products/${p.id}/media`)
        .send({ objectKey: target.key, alt })
        .expect(201);
      ids.push(confirmed.body.id);
    }
    await manager.delete(`/admin/commerce/products/${p.id}/media/${ids[1]}`).expect(200);
    await manager
      .patch(`/admin/commerce/products/${p.id}/status`)
      .send({ status: "ACTIVE", reason: "Should be refused" })
      .expect(409);
  });

  it("deactivates a public product when removing a required gallery image", async () => {
    const manager = await commerceAdmin();
    const { product: p } = await product();
    const ids: string[] = [];
    for (const alt of ["Front package view", "Ingredients panel", "Product in use"]) {
      const target = await uploadedTarget(manager, p.id);
      const confirmed = await manager
        .post(`/admin/commerce/products/${p.id}/media`)
        .send({ objectKey: target.key, alt })
        .expect(201);
      ids.push(confirmed.body.id);
    }
    await manager
      .patch(`/admin/commerce/products/${p.id}/status`)
      .send({ status: "ACTIVE", reason: "Complete gallery reviewed" })
      .expect(200);

    await manager.delete(`/admin/commerce/products/${p.id}/media/${ids[0]}`).expect(200);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("INACTIVE");
    const statusAudits = await prisma.adminAuditLog.findMany({
      where: { entityType: "PRODUCT", entityId: p.id, action: "product.status_changed" },
      select: { afterSummary: true },
    });
    expect(statusAudits.some((entry) => JSON.stringify(entry.afterSummary) === '{"status":"INACTIVE"}')).toBe(true);
  });

  it("serializes concurrent image confirmations and never exceeds three images", async () => {
    const manager = await commerceAdmin();
    const { product: p } = await product();
    const targets = await Promise.all([0, 1, 2, 3].map(() => uploadedTarget(manager, p.id)));
    const results = await Promise.all(
      targets.map((target, index) =>
        manager
          .post(`/admin/commerce/products/${p.id}/media`)
          .send({ objectKey: target.key, alt: `Product image ${index + 1}` }),
      ),
    );

    expect(results.filter((response) => response.status === 201)).toHaveLength(3);
    expect(results.filter((response) => response.status === 409)).toHaveLength(1);
    expect(await prisma.productMedia.count({ where: { productId: p.id } })).toBe(3);
  });
});
