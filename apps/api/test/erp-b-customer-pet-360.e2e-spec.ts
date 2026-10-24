import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { hashPassword } from "../src/common/password/password-hash.util";

type Actor = { id: string; cookie: string; csrf: string };

/** ERP-B: Customer 360 overview + account suspension/session revocation, Pet 360 + diagnostics + grant repair. */
describe("ERP-B Customer 360 and Pet 360", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole, extra: { username?: string; password?: string } = {}): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `erpb-${randomUUID()}@example.com`, ...(extra.username ? { username: extra.username, normalizedUsername: extra.username.toLowerCase(), passwordHash: await hashPassword(extra.password!) } : {}) } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function login(username: string, password: string) {
    const r0 = await request(server()).get("/health/live");
    const csrf = extractCookie(r0.headers["set-cookie"], "petlife_csrf")!;
    return request(server()).post("/auth/login/password").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ username, password });
  }
  const loginStatus = async (username: string, password: string) => { const r = await login(username, password); return { status: r.status, code: r.body?.error?.code }; };

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("Customer 360 overview: metadata only, finance gated by finance.view, never chat bodies or medical text", async () => {
    const support = await actor("support", AdminRole.SUPPORT);
    const finance = await actor("finance", AdminRole.FINANCE);
    const member = await actor("member");
    const other = await actor("other");
    const hh = await db.household.create({ data: { name: "hh", members: { create: { userId: member.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Rex", species: "DOG", approximateAgeMonths: 20 } });
    await db.medicalDocument.create({ data: { petId: pet.id, householdId: hh.id, title: "SECRET-DIAGNOSIS-TITLE", documentType: "LAB_REPORT", sourceType: "OWNER", fileObjectKey: `health-documents/${pet.id}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 10 } });
    const convo = await db.chatConversation.create({ data: { pairKey: [member.id, other.id].sort().join(":"), participants: { create: [{ userId: member.id }, { userId: other.id }] } } });
    await db.chatMessage.create({ data: { conversationId: convo.id, senderUserId: member.id, body: "SECRET-CHAT-BODY" } });

    await get(member, `/admin/customers/${member.id}/overview`).expect(403);
    await get(support, "/admin/customers/not-a-uuid/overview").expect(400);
    await get(support, `/admin/customers/${randomUUID()}/overview`).expect(404);
    const view = (await get(support, `/admin/customers/${member.id}/overview`).expect(200)).body;
    expect(view.account).toMatchObject({ status: "ACTIVE", activeSessions: 1 });
    expect(view.households[0]).toMatchObject({ id: hh.id, role: "OWNER", petCount: 1 });
    expect(view.community.conversations).toBe(1);
    expect(view.finance).toEqual({ restricted: true });
    const text = JSON.stringify(view);
    expect(text).not.toContain("SECRET-CHAT-BODY");
    expect(text).not.toContain("SECRET-DIAGNOSIS-TITLE");
    expect(text).not.toMatch(/erpb-[0-9a-f-]{36}@example\.com/);
    expect((await get(finance, `/admin/customers/${member.id}/overview`).expect(200)).body.finance.restricted).toBe(false);
  });

  it("suspension: trust/admin only, revokes sessions, blocks sign-in, refuses staff and self, audited and reversible", async () => {
    const trust = await actor("trust", AdminRole.TRUST_SAFETY);
    const support = await actor("support", AdminRole.SUPPORT);
    const staff = await actor("staff", AdminRole.FINANCE);
    const username = `erpb_${randomUUID().slice(0, 8)}`;
    const member = await actor("member", undefined, { username, password: "correct horse battery 1" });
    await get(member, "/me").expect(200);

    await post(support, `/admin/customers/${member.id}/suspend`).send({ reason: "fraud report" }).expect(403);
    await post(trust, `/admin/customers/${member.id}/suspend`).send({}).expect(400);
    expect((await post(trust, `/admin/customers/${staff.id}/suspend`).send({ reason: "staff account" }).expect(409)).body.error.details.rule).toBe("STAFF_ACCOUNT");
    expect((await post(trust, `/admin/customers/${trust.id}/suspend`).send({ reason: "myself" }).expect(409)).body.error.details.rule).toBe("SELF_CHANGE_FORBIDDEN");
    expect((await post(trust, `/admin/customers/${member.id}/suspend`).send({ reason: "fraud report confirmed" }).expect(201)).body).toMatchObject({ accountStatus: "SUSPENDED", sessionsRevoked: 1 });
    await get(member, "/me").expect(401);
    expect(await loginStatus(username, "correct horse battery 1")).toEqual({ status: 403, code: "ACCOUNT_SUSPENDED" });
    expect((await post(trust, `/admin/customers/${member.id}/suspend`).send({ reason: "again again" }).expect(400)).body.error.details.reason).toBe("UNCHANGED");
    expect((await get(trust, `/admin/customers?q=member`).expect(200)).body.items.find((i: { id: string }) => i.id === member.id)?.accountStatus ?? "SUSPENDED").toBe("SUSPENDED");
    await post(trust, `/admin/customers/${member.id}/unsuspend`).send({ reason: "appeal accepted" }).expect(201);
    expect((await loginStatus(username, "correct horse battery 1")).status).toBe(200);
    expect((await db.adminAuditLog.findMany({ where: { entityType: "User", entityId: member.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action)).toEqual(["customer.suspended", "customer.unsuspended"]);
    expect(await db.domainEvent.count({ where: { type: { in: ["UserAccountSuspended", "UserAccountReinstated"] }, aggregateId: member.id } })).toBe(2);

    // Support can sign a compromised member out everywhere (no suspension power needed).
    const victim = await actor("victim");
    expect((await post(support, `/admin/customers/${victim.id}/sessions/revoke`).send({ reason: "account takeover suspected" }).expect(201)).body.sessionsRevoked).toBe(1);
    await get(victim, "/me").expect(401);
    await post(staff, `/admin/customers/${victim.id}/sessions/revoke`).send({ reason: "finance can't" }).expect(403);
  });

  it("Pet 360: search by name/microchip, grants with provenance, diagnostics, stale grant repair (never the owner's)", async () => {
    const support = await actor("support", AdminRole.SUPPORT);
    const finance = await actor("finance", AdminRole.FINANCE);
    const owner = await actor("owner");
    const leaver = await actor("leaver");
    const chip = `98511${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`;
    const hh = await db.household.create({ data: { name: "hh", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const name = `Pet360-${randomUUID().slice(0, 6)}`;
    const pet = await db.pet.create({ data: { householdId: hh.id, name, species: "CAT", approximateAgeMonths: 30, microchipNumber: chip, microchipNormalized: chip } });
    const ownerGrant = await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewHealth: true, canManageAccess: true } });
    const stale = await db.petAccessGrant.create({ data: { petId: pet.id, userId: leaver.id, canViewHealth: true, source: "HOUSEHOLD" } });
    await db.medicalDocument.create({ data: { petId: pet.id, householdId: hh.id, title: "SECRET-LAB-TITLE", documentType: "LAB_REPORT", sourceType: "OWNER", fileObjectKey: `health-documents/${pet.id}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 10 } });

    expect((await get(support, `/admin/pets?q=${name}`).expect(200)).body.items.map((p: { id: string }) => p.id)).toEqual([pet.id]);
    expect((await get(support, `/admin/pets?q=${chip}`).expect(200)).body.items.map((p: { id: string }) => p.id)).toEqual([pet.id]);
    await get(owner, `/admin/pets/${pet.id}`).expect(403);
    const view = (await get(support, `/admin/pets/${pet.id}`).expect(200)).body;
    expect(view.identity.microchipMasked).toBe(`${chip.slice(0, 3)}***${chip.slice(-3)}`);
    expect(view.health.documentsByType).toEqual([expect.objectContaining({ documentType: "LAB_REPORT", count: 1 })]);
    expect(JSON.stringify(view)).not.toContain("SECRET-LAB-TITLE");
    expect(JSON.stringify(view)).not.toContain(chip);
    const codes = view.diagnostics.map((d: { code: string }) => d.code);
    expect(codes).toContain("STALE_HOUSEHOLD_GRANT");
    expect(view.accessGrants.find((g: { id: string }) => g.id === stale.id)).toMatchObject({ isHouseholdMember: false, active: true, source: "HOUSEHOLD" });

    await post(finance, `/admin/pets/${pet.id}/grants/${stale.id}/revoke`).send({ reason: "left the household" }).expect(403);
    expect((await post(support, `/admin/pets/${pet.id}/grants/${ownerGrant.id}/revoke`).send({ reason: "should never work" }).expect(400)).body.error.details.reason).toBe("OWNER_GRANT");
    await post(support, `/admin/pets/${pet.id}/grants/${stale.id}/revoke`).send({ reason: "left the household" }).expect(201);
    expect((await post(support, `/admin/pets/${pet.id}/grants/${stale.id}/revoke`).send({ reason: "left the household" }).expect(400)).body.error.details.reason).toBe("ALREADY_REVOKED");
    await post(support, `/admin/pets/${randomUUID()}/grants/${stale.id}/revoke`).send({ reason: "wrong pet id" }).expect(404);
    const after = (await get(support, `/admin/pets/${pet.id}`).expect(200)).body;
    expect(after.diagnostics.map((d: { code: string }) => d.code)).not.toContain("STALE_HOUSEHOLD_GRANT");
    expect(await db.adminAuditLog.count({ where: { action: "pet.access_revoked_by_admin", entityId: pet.id } })).toBe(1);
  });
});
