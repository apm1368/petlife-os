import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; adminUserId: string; cookie: string; csrf: string };

/**
 * W2-4. Permissions decide what an admin may do; verticals decide whose rows. A scoped role that
 * holds the right permission must still be refused on another vertical's endpoints — the menu
 * hiding a section is never what protects it, so every case here goes through the HTTP API.
 */
describe("Admin vertical scoping (W2-4)", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(role: AdminRole, serviceScopes: AdminVertical[] = []): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: `w2-4 ${role}`, email: `w2-4-${randomUUID()}@example.com` } });
    const admin = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE, serviceScopes } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  /** One endpoint per vertical, each already permission-gated before this change. */
  const SHOP = "/admin/commerce/orders";
  const ACCOMMODATION = "/admin/travel/listings";
  const INSURANCE = "/admin/insurance/providers";
  const CONTENT = "/admin/content/articles";
  const SUPPORT = "/admin/support";

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("keeps an unscoped role reaching every vertical, exactly as before", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    for (const url of [SHOP, ACCOMMODATION, INSURANCE, CONTENT, SUPPORT]) {
      expect((await get(root, url)).status).not.toBe(403);
    }
    expect((await get(root, "/admin/me/capabilities").expect(200)).body.verticals).toBeNull();
  });

  it("confines a shop administrator to the shop", async () => {
    const shop = await actor(AdminRole.SHOP_ADMIN);
    expect((await get(shop, SHOP)).status).not.toBe(403);
    // Refused either way: a shop administrator holds neither the other verticals' permissions nor
    // their scope, and whichever check fires first, the answer is 403.
    for (const url of [ACCOMMODATION, INSURANCE, CONTENT, SUPPORT]) await get(shop, url).expect(403);
    expect((await get(shop, "/admin/me/capabilities").expect(200)).body.verticals).toEqual([AdminVertical.SHOP]);
  });

  it("confines a content administrator to content, including away from support", async () => {
    const content = await actor(AdminRole.CONTENT_ADMIN);
    expect((await get(content, CONTENT)).status).not.toBe(403);
    for (const url of [SHOP, ACCOMMODATION, INSURANCE, SUPPORT]) await get(content, url).expect(403);
  });

  it("confines a support agent to support", async () => {
    const agent = await actor(AdminRole.SUPPORT_AGENT);
    expect((await get(agent, SUPPORT)).status).not.toBe(403);
    for (const url of [SHOP, ACCOMMODATION, INSURANCE, CONTENT]) await get(agent, url).expect(403);
  });

  it("gives two service administrators different reach from the same role", async () => {
    const host = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.ACCOMMODATION]);
    const insurer = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.INSURANCE]);

    expect((await get(host, ACCOMMODATION)).status).not.toBe(403);
    expect((await get(insurer, INSURANCE)).status).not.toBe(403);

    // The case that proves the second axis carries its own weight: SERVICE_ADMIN holds both
    // travel.view and insurance.view, so the permission check passes for each of them here and the
    // *only* thing refusing the other vertical is the scope.
    const crossed = await get(host, INSURANCE).expect(403);
    expect(crossed.body.error.details).toMatchObject({ reason: "OUT_OF_VERTICAL_SCOPE" });
    const crossedBack = await get(insurer, ACCOMMODATION).expect(403);
    expect(crossedBack.body.error.details).toMatchObject({ reason: "OUT_OF_VERTICAL_SCOPE" });
  });

  it("refuses every vertical to a service administrator whose scopes were never configured", async () => {
    const unconfigured = await actor(AdminRole.SERVICE_ADMIN);
    for (const url of [SHOP, ACCOMMODATION, INSURANCE, CONTENT, SUPPORT]) await get(unconfigured, url).expect(403);
    expect((await get(unconfigured, "/admin/me/capabilities").expect(200)).body.verticals).toEqual([]);
  });

  it("applies a scope change to the next request, without a new session", async () => {
    const admin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    await get(admin, ACCOMMODATION).expect(403);

    await db.adminUser.update({ where: { id: admin.adminUserId }, data: { serviceScopes: [AdminVertical.ACCOMMODATION] } });

    expect((await get(admin, ACCOMMODATION)).status).not.toBe(403);
    expect((await get(admin, "/admin/me/capabilities").expect(200)).body.verticals).toEqual([AdminVertical.ACCOMMODATION]);
  });

  it("manages service scopes only through audited admin APIs and applies them immediately", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    const scoped = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    const changed = (await post(root, `/admin/access/admins/${scoped.adminUserId}/scopes`).send({ serviceScopes: [AdminVertical.GROOMING], reason: "Move service administrator to grooming" }).expect(201)).body;
    expect(changed.serviceScopes).toEqual([AdminVertical.GROOMING]);
    expect((await get(scoped, "/admin/me/capabilities").expect(200)).body.verticals).toEqual([AdminVertical.GROOMING]);
    expect((await db.adminAuditLog.findFirstOrThrow({ where: { entityId: scoped.adminUserId, action: "admin_user.scopes_changed" } })).reason).toBe("Move service administrator to grooming");
    await post(root, `/admin/access/admins/${scoped.adminUserId}/scopes`).send({ serviceScopes: [], reason: "Invalid empty scope" }).expect(400);

    const ordinary = await actor(AdminRole.ADMIN);
    await post(root, `/admin/access/admins/${ordinary.adminUserId}/scopes`).send({ serviceScopes: [AdminVertical.CLINIC], reason: "Invalid scope on broad role" }).expect(400);
  });

  it("requires explicit valid scopes when changing a membership into SERVICE_ADMIN and clears them when leaving", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    const target = await actor(AdminRole.READ_ONLY);
    await post(root, `/admin/access/admins/${target.adminUserId}/role`).send({ role: AdminRole.SERVICE_ADMIN, reason: "Missing scope assignment" }).expect(400);
    const changed = (await post(root, `/admin/access/admins/${target.adminUserId}/role`).send({ role: AdminRole.SERVICE_ADMIN, serviceScopes: [AdminVertical.CLINIC], reason: "Assign clinic operations" }).expect(201)).body;
    expect(changed).toMatchObject({ role: AdminRole.SERVICE_ADMIN, serviceScopes: [AdminVertical.CLINIC] });
    const left = (await post(root, `/admin/access/admins/${target.adminUserId}/role`).send({ role: AdminRole.READ_ONLY, reason: "Return to read only" }).expect(201)).body;
    expect(left).toMatchObject({ role: AdminRole.READ_ONLY, serviceScopes: [] });
  });

  it("still refuses a vertical the role's permissions do not cover", async () => {
    // The two axes are independent: being inside your vertical never grants a permission you lack.
    const agent = await actor(AdminRole.SUPPORT_AGENT);
    await get(agent, "/admin/access/admins").expect(403);
    await get(agent, "/admin/settings").expect(403);
  });
});
