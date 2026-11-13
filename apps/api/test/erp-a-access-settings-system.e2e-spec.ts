import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PlatformSettingsService } from "../src/modules/platform-settings/platform-settings.service";

type Actor = { id: string; email: string; adminUserId?: string; cookie: string; csrf: string };

/** ERP-A: access control, settings registry with approval, system health and integration status. */
describe("ERP-A access control, settings, system", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const email = `erpa-${randomUUID()}@example.com`;
    const user = await db.user.create({ data: { displayName: name, email, emailVerifiedAt: new Date() } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, email, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("capabilities require an active admin and reflect role changes without a new session", async () => {
    await get(null, "/admin/me/capabilities").expect(401);
    await get(await actor("member"), "/admin/me/capabilities").expect(403);
    const editor = await actor("editor", AdminRole.EDITOR);
    const caps = (await get(editor, "/admin/me/capabilities").expect("Cache-Control", "no-store").expect(200)).body;
    // verticals is null for every unscoped role, EDITOR among them: the vertical axis confines only
    // the Wave 2 scoped roles, so no pre-existing role lost reach when it was introduced.
    expect(caps).toEqual({ role: "EDITOR", permissions: ["content.view", "content.create", "content.edit", "content.media.manage"], verticals: null });
    await get(editor, "/admin/support/cases").expect(403);
    expect((await get(editor, "/admin/dashboard").expect(200)).body).toEqual({ openSupportCases: null, openDisputes: null, openTrustCases: null, pendingRefundApprovals: null, openTasks: null, pendingVerifications: null, pendingRefundRequests: null, pendingOfferModeration: null, pendingCatalogRequests: null, pendingTravelListings: null, pendingSupportNeeds: null, openCommunityReports: null, pendingMemorials: null, openPlaceReports: null, pendingWalletTopUps: null, pendingDeletionRequests: null, openOwnershipDisputes: null, openProviderNoShows: null, launchKpis: null });
    await db.adminUser.update({ where: { id: editor.adminUserId }, data: { role: AdminRole.SUPPORT } });
    const supportCaps = (await get(editor, "/admin/me/capabilities").expect(200)).body;
    expect(supportCaps.role).toBe("SUPPORT");
    expect(supportCaps.permissions).toContain("support.manage");
    expect(supportCaps.permissions).not.toContain("content.edit");
    const summary = (await get(editor, "/admin/dashboard").expect(200)).body;
    expect(summary).toMatchObject({ openSupportCases: expect.any(Number), openDisputes: expect.any(Number), openTasks: expect.any(Number), pendingRefundApprovals: null, openTrustCases: null });
    await db.adminUser.update({ where: { id: editor.adminUserId }, data: { status: AdminMembershipStatus.SUSPENDED } });
    await get(editor, "/admin/me/capabilities").expect(403);
    await get(editor, "/admin/dashboard").expect(403);
  });

  it("access control: read for ADMIN, changes for SUPER_ADMIN only, self-change refused, suspension effective immediately, audited", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const admin = await actor("admin", AdminRole.ADMIN);
    const support = await actor("support", AdminRole.SUPPORT);
    const member = await actor("member");
    const candidate = await actor("candidate");

    const roles = (await get(admin, "/admin/access/roles").expect(200)).body;
    expect(roles.find((r: { role: string }) => r.role === "SUPER_ADMIN")).toMatchObject({ protected: true });
    expect(roles.find((r: { role: string }) => r.role === "ANALYTICS").permissions).toEqual(["analytics.view"]);
    expect((await get(admin, "/admin/access/permissions").expect(200)).body.find((p: { permission: string }) => p.permission === "admin.manage").roles).toEqual(["SUPER_ADMIN"]);
    await get(support, "/admin/access/roles").expect(403);
    await get(member, "/admin/access/admins").expect(403);
    const listed = (await get(admin, `/admin/access/admins?q=${encodeURIComponent(root.email.slice(0, 14))}`).expect(200)).body;
    expect(listed.items[0]).toMatchObject({ id: root.adminUserId, role: "SUPER_ADMIN" });
    expect(JSON.stringify(listed)).not.toContain(root.email);

    await send("post", admin, "/admin/access/admins").send({ email: candidate.email, role: "SUPPORT", reason: "new support hire" }).expect(403);
    await send("post", root, "/admin/access/admins").send({ email: candidate.email, role: "SUPPORT" }).expect(400); // reason required
    // Admin access only for a proven email or mobile (market-readiness Q76).
    const unverified = await db.user.create({ data: { displayName: "unverified", email: `erpa-unverified-${randomUUID()}@example.com` } });
    expect((await send("post", root, "/admin/access/admins").send({ email: unverified.email, role: "SUPPORT", reason: "should be refused" }).expect(409)).body.error.details.rule).toBe("UNVERIFIED_CONTACT");
    // A verified phone never vouches for an unverified email (someone could register a future admin's email).
    const phoneOnly = await db.user.create({ data: { displayName: "phone only", email: `erpa-phone-only-${randomUUID()}@example.com`, phone: `+989${randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9)}`, phoneVerifiedAt: new Date() } });
    expect((await send("post", root, "/admin/access/admins").send({ email: phoneOnly.email, role: "SUPPORT", reason: "should be refused" }).expect(409)).body.error.details.rule).toBe("UNVERIFIED_CONTACT");
    const granted = (await send("post", root, "/admin/access/admins").send({ email: candidate.email.toUpperCase(), role: "SUPPORT", reason: "new support hire" }).expect(201)).body;
    expect(granted).toMatchObject({ role: "SUPPORT", status: "ACTIVE" });
    expect((await send("post", root, "/admin/access/admins").send({ email: candidate.email, role: "FINANCE", reason: "duplicate grant" }).expect(409)).body.error.details.rule).toBe("ALREADY_ADMIN");
    await get(candidate, "/admin/support/cases").expect((r) => expect(r.status).not.toBe(403));

    expect((await send("post", root, `/admin/access/admins/${root.adminUserId}/suspend`).send({ reason: "testing self" }).expect(409)).body.error.details.rule).toBe("SELF_CHANGE_FORBIDDEN");
    expect((await send("post", root, `/admin/access/admins/${granted.id}/role`).send({ role: "SUPPORT", reason: "same role" }).expect(400)).body.error.details.reason).toBe("UNCHANGED");
    await send("post", root, `/admin/access/admins/${granted.id}/role`).send({ role: "COMMERCE_OPERATIONS", reason: "moved to commerce" }).expect(201);
    await send("post", root, `/admin/access/admins/${granted.id}/suspend`).send({ reason: "left the team" }).expect(201);
    await get(candidate, "/admin/support/cases").expect(403);
    expect((await get(candidate, "/admin/me").expect(200)).body.isAdmin).toBe(false);
    await send("post", root, `/admin/access/admins/${granted.id}/reactivate`).send({ reason: "came back" }).expect(201);

    const audit = (await get(root, `/admin/audit?entityType=AdminUser&entityId=${granted.id}`).expect(200)).body;
    expect(audit.items.map((a: { action: string }) => a.action)).toEqual(["admin_user.reactivated", "admin_user.suspended", "admin_user.role_changed", "admin_user.granted"]);
    const byPrefix = (await get(root, `/admin/audit?action=admin_user.&from=${new Date(Date.now() - 60e3).toISOString()}`).expect(200)).body;
    expect(byPrefix.items.every((a: { action: string }) => a.action.startsWith("admin_user."))).toBe(true);
    expect(await db.domainEvent.count({ where: { type: "AdminMembershipChanged", aggregateId: granted.id } })).toBe(4);
  });

  it("custom roles: SUPER_ADMIN defines per-section access, members get exactly it on their next request, and role management is never delegable", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const admin = await actor("plain admin", AdminRole.ADMIN);
    const staff = await actor("content editor", AdminRole.EDITOR);
    const body = { name: `Shop desk ${randomUUID().slice(0, 6)}`, description: "Runs the shop", permissions: ["commerce.view", "commerce.manage"], verticals: ["SHOP"], reason: "Shop team gets its own role" };
    await send("post", admin, "/admin/access/custom-roles").send(body).expect(403);
    await send("post", root, "/admin/access/custom-roles").send({ ...body, permissions: ["admin.manage"] }).expect(409);
    await send("post", root, "/admin/access/custom-roles").send({ ...body, permissions: ["commerce.vew"] }).expect(400);
    const role = (await send("post", root, "/admin/access/custom-roles").send(body).expect(201)).body;
    expect(role).toMatchObject({ name: body.name, permissions: ["commerce.view", "commerce.manage"], verticals: ["SHOP"], members: 0 });
    await send("post", root, "/admin/access/custom-roles").send({ ...body, name: body.name.toUpperCase() }).expect(409);
    expect((await get(admin, "/admin/access/custom-roles").expect(200)).body.some((r: { id: string }) => r.id === role.id)).toBe(true);

    // Before: an EDITOR reaches content, not the shop.
    await get(staff, "/admin/content/articles").expect(200);
    await get(staff, "/admin/commerce/orders").expect(403);
    await send("put", root, `/admin/access/admins/${root.adminUserId}/custom-role`).send({ customRoleId: role.id, reason: "Self change attempt" }).expect(409);
    await send("put", root, `/admin/access/admins/${staff.adminUserId}/custom-role`).send({ customRoleId: role.id, reason: "Moves to the shop desk" }).expect(200);
    // After: exactly the role's permissions — the shop opens, content closes — with no new session.
    await get(staff, "/admin/commerce/orders").expect(200);
    await get(staff, "/admin/content/articles").expect(403);
    const me = (await get(staff, "/admin/me").expect(200)).body;
    expect(me).toMatchObject({ customRoleName: body.name });
    expect([...me.permissions].sort()).toEqual(["commerce.manage", "commerce.view"]);
    expect((await get(staff, "/admin/me/capabilities").expect(200)).body.verticals).toEqual(["SHOP"]);
    expect((await get(root, `/admin/access/admins/${staff.adminUserId}`).expect(200)).body).toMatchObject({ customRole: { id: role.id, name: body.name } });

    // Editing the role applies on the next request; a role with members cannot be archived.
    await send("put", root, `/admin/access/custom-roles/${role.id}`).send({ ...body, permissions: ["commerce.view"], reason: "Read only for now" }).expect(200);
    expect((await get(staff, "/admin/me").expect(200)).body.permissions).toEqual(["commerce.view"]);
    await send("post", root, `/admin/access/custom-roles/${role.id}/archive`).send({ reason: "No longer needed" }).expect(409);
    await send("put", root, `/admin/access/admins/${staff.adminUserId}/custom-role`).send({ customRoleId: null, reason: "Back to content" }).expect(200);
    await get(staff, "/admin/content/articles").expect(200);
    await send("post", root, `/admin/access/custom-roles/${role.id}/archive`).send({ reason: "No longer needed" }).expect(201);
    await send("put", root, `/admin/access/admins/${staff.adminUserId}/custom-role`).send({ customRoleId: role.id, reason: "Archived role" }).expect(409);
    // The database refuses what the service refuses, even for a direct write.
    await expect(db.adminCustomRole.create({ data: { name: "Root clone", permissions: ["admin.manage"], createdByAdminId: root.adminUserId!, updatedByAdminId: root.adminUserId! } })).rejects.toThrow();
    const actions = (await db.adminAuditLog.findMany({ where: { entityId: { in: [role.id, staff.adminUserId!] } }, select: { action: true } })).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["admin_role.created", "admin_role.updated", "admin_role.archived", "admin_user.custom_role_assigned", "admin_user.custom_role_cleared"]));
  });

  it("settings: harmless keys apply at once and are public only when PUBLIC; high-impact keys need a different approver; stale versions are refused", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const root2 = await actor("root2", AdminRole.SUPER_ADMIN);
    const admin = await actor("admin", AdminRole.ADMIN);
    const ops = await actor("ops", AdminRole.OPERATIONS);
    const settings = app.get(PlatformSettingsService);

    const list = (await get(ops, "/admin/settings").expect(200)).body;
    expect(list.map((s: { key: string }) => s.key)).toEqual(expect.arrayContaining(["platform.announcement", "booking.holdTtlSeconds", "commerce.refundApprovalThresholdIrr"]));
    await send("put", ops, "/admin/settings/platform.announcement").send({ value: null, baseVersion: 0, reason: "ops can't" }).expect(403);
    await get(await actor("member"), "/admin/settings").expect(403);

    const ann = list.find((s: { key: string }) => s.key === "platform.announcement");
    const text = { fa: `اطلاعیه ${randomUUID().slice(0, 6)}`, en: "Scheduled maintenance tonight" };
    await send("put", admin, "/admin/settings/platform.announcement").send({ value: { fa: "x", fr: "y" }, baseVersion: ann.version, reason: "bad locale" }).expect(400);
    await send("put", admin, "/admin/settings/unknown.key").send({ value: 1, baseVersion: 0, reason: "nope nope" }).expect(404);
    const applied = (await send("put", admin, "/admin/settings/platform.announcement").send({ value: text, baseVersion: ann.version, reason: "maintenance notice" }).expect(200)).body;
    expect(applied.status).toBe("APPLIED");
    expect((await get(null, "/settings/public").expect(200)).body["platform.announcement"]).toEqual(text);
    expect(JSON.stringify((await get(null, "/settings/public")).body)).not.toContain("holdTtl");
    expect((await send("put", admin, "/admin/settings/platform.announcement").send({ value: null, baseVersion: ann.version, reason: "stale base" }).expect(409)).body.error.code).toBe("SETTING_CHANGE_CONFLICT");
    await send("put", admin, "/admin/settings/platform.announcement").send({ value: null, baseVersion: ann.version + 1, reason: "clear notice" }).expect(200);

    // High impact: booking hold TTL. Proposals stay pending; the requester can't approve; ADMIN can't approve at all.
    const hold = (await get(root, "/admin/settings").expect(200)).body.find((s: { key: string }) => s.key === "booking.holdTtlSeconds");
    const before = settings.getInt("booking.holdTtlSeconds");
    await send("put", admin, "/admin/settings/booking.holdTtlSeconds").send({ value: 60, baseVersion: hold.version, reason: "too short" }).expect(400);
    const p1 = (await send("put", admin, "/admin/settings/booking.holdTtlSeconds").send({ value: before + 60, baseVersion: hold.version, reason: "members need more time" }).expect(200)).body;
    const p2 = (await send("put", root, "/admin/settings/booking.holdTtlSeconds").send({ value: before + 120, baseVersion: hold.version, reason: "competing proposal" }).expect(200)).body;
    expect([p1.status, p2.status]).toEqual(["PENDING", "PENDING"]);
    expect(settings.getInt("booking.holdTtlSeconds")).toBe(before);
    await send("post", admin, `/admin/settings/changes/${p1.id}/review`).send({ decision: "APPROVE" }).expect(403);
    expect((await send("post", root, `/admin/settings/changes/${p2.id}/review`).send({ decision: "APPROVE" }).expect(409)).body.error.details.rule).toBe("SELF_APPROVAL_FORBIDDEN");
    expect((await send("post", root, `/admin/settings/changes/${p1.id}/review`).send({ decision: "APPROVE", note: "ok" }).expect(201)).body.status).toBe("APPLIED");
    expect(settings.getInt("booking.holdTtlSeconds")).toBe(before + 60);
    expect((await send("post", root2, `/admin/settings/changes/${p2.id}/review`).send({ decision: "APPROVE" }).expect(409)).body.error.details.reason).toBe("SUPERSEDED");
    // Restore the default through the same workflow (other suites share this DB).
    const restore = (await send("put", root, "/admin/settings/booking.holdTtlSeconds").send({ value: before, baseVersion: hold.version + 1, reason: "restore default" }).expect(200)).body;
    await send("post", root2, `/admin/settings/changes/${restore.id}/review`).send({ decision: "APPROVE" }).expect(201);
    expect(settings.getInt("booking.holdTtlSeconds")).toBe(before);
    const history = (await get(ops, "/admin/settings/changes?key=booking.holdTtlSeconds").expect(200)).body;
    expect(history.items.map((c: { status: string }) => c.status)).toEqual(expect.arrayContaining(["APPLIED", "SUPERSEDED"]));
    expect(await db.adminAuditLog.count({ where: { entityType: "PlatformSetting", entityId: "booking.holdTtlSeconds", action: "setting.change_approved" } })).toBeGreaterThanOrEqual(2);
  });

  it("system health and integrations: read-only staff only, no secrets, truthful statuses", async () => {
    const ro = await actor("ro", AdminRole.READ_ONLY);
    await get(await actor("support", AdminRole.SUPPORT), "/admin/system/health").expect(403);
    await get(await actor("member"), "/admin/system/integrations").expect(403);
    const health = (await get(ro, "/admin/system/health").expect(200)).body;
    expect(health.components.database.status).toBe("UP");
    expect(health.components.redis.status).toBe("UP");
    expect(health.components.migrations.latest).toMatch(/^\d+_/);
    expect(health.components.migrations.failed).toEqual([]);
    expect(health.components.outbox).toHaveProperty("pending");
    const integrations = (await get(ro, "/admin/system/integrations").expect(200)).body;
    const status = Object.fromEntries(integrations.items.map((i: { key: string; status: string }) => [i.key, i.status]));
    expect(status).toMatchObject({ TLS: "NOT_CONFIGURED", OTP: "SANDBOX", PAYMENT: "SANDBOX", MAPS: "NOT_IMPLEMENTED", EMAIL: "NOT_CONFIGURED" });
    const text = JSON.stringify([health, integrations]);
    for (const secret of [process.env.SESSION_SECRET!, process.env.CSRF_SECRET!]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/postgres(ql)?:\/\/|redis:\/\//);
  });
});
