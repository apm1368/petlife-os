import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { createTestApp, extractCookie } from "./test-app";
import { DIGIKALA_CATALOG_IMPORT_FLAG } from "../src/modules/admin/commerce/catalog-import.service";

describe("admin catalog import job controls", () => {
  let app: INestApplication;
  let db: PrismaService;
  let csrf: string;
  const jobIds: string[] = [];
  const users: string[] = [];
  const adminIds: string[] = [];
  let createdImportFlag = false;

  async function actor(role: AdminRole) {
    const user = await db.user.create({ data: { displayName: `import-${role}`, email: `import-${randomUUID()}@example.com` } });
    users.push(user.id);
    const membership = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    adminIds.push(membership.id);
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const server = () => app.getHttpServer();
    return {
      get: (path: string) => request(server()).get(path).set("Cookie", cookie),
      post: (path: string) => request(server()).post(path).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  });

  afterAll(async () => {
    if (createdImportFlag) await db.featureFlag.deleteMany({ where: { key: DIGIKALA_CATALOG_IMPORT_FLAG } });
    await db.catalogImportJob.deleteMany({ where: { id: { in: jobIds } } });
    await db.adminAuditLog.deleteMany({ where: { adminUserId: { in: adminIds } } });
    await db.adminUser.deleteMany({ where: { userId: { in: users } } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it("queues an idempotent admin-only job without reading a source page in the request", async () => {
    const admin = await actor(AdminRole.SUPER_ADMIN);
    const viewer = await actor(AdminRole.READ_ONLY);
    const category = await db.productCategory.create({ data: { name: `Import ${randomUUID()}`, slug: `import-${randomUUID()}` } });
    const idempotencyKey = randomUUID();
    const body = { urls: ["https://www.digikala.com/product/dkp-42/"], categoryId: category.id, maxPages: 5, maxProducts: 10, idempotencyKey };
    await viewer.post("/admin/commerce/catalog-imports").send(body).expect(403);
    await admin.post("/admin/commerce/catalog-imports").send(body).expect(409).expect(({ body: response }) => {
      expect(response.error.code).toBe("CATALOG_IMPORT_UNAVAILABLE");
    });
    const existingFlag = await db.featureFlag.findUnique({ where: { key: DIGIKALA_CATALOG_IMPORT_FLAG } });
    expect(existingFlag).toBeNull();
    await db.featureFlag.create({ data: { key: DIGIKALA_CATALOG_IMPORT_FLAG, description: "Test-only authorization for the Digikala importer", isEnabled: true, rolloutPercentage: 100 } });
    createdImportFlag = true;
    const first = (await admin.post("/admin/commerce/catalog-imports").send(body).expect(201)).body;
    const second = (await admin.post("/admin/commerce/catalog-imports").send(body).expect(201)).body;
    jobIds.push(first.id);
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ status: "QUEUED", submittedUrls: body.urls, targetCategoryId: category.id, productsImported: 0 });
    expect(await db.catalogImportJob.count({ where: { idempotencyKey } })).toBe(1);
    await admin.post(`/admin/commerce/catalog-imports/${first.id}/cancel`).expect(201);
    expect(await db.catalogImportJob.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "CANCELLED" });
    await admin.post("/admin/commerce/catalog-imports").send({ ...body, idempotencyKey: randomUUID(), urls: ["https://www.digikala.com/product/dkp-42/?page=2"] }).expect(400);
    await db.catalogImportJob.delete({ where: { id: first.id } });
    if (createdImportFlag) await db.featureFlag.delete({ where: { key: DIGIKALA_CATALOG_IMPORT_FLAG } });
    createdImportFlag = false;
    await db.productCategory.delete({ where: { id: category.id } });
  });

});
