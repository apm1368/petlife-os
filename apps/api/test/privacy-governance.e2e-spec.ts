import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G19: deletion state machine (never executed), consent history, real-user release gate. */
describe("Privacy governance", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "patch", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g19-${randomUUID()}@example.com` } });
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

  it("deletion: admin moves REQUESTED → PENDING_RETENTION; READY blocked without approved policy; COMPLETED never; member cancels before execution", async () => {
    const member = await actor("member");
    const admin = await actor("admin", AdminRole.SUPER_ADMIN);
    const support = await actor("support", AdminRole.SUPPORT);
    const req = await db.accountDeletionRequest.create({ data: { userId: member.id, reason: "test" } });
    const transition = (a: Actor, to: string) => send("post", a, `/admin/privacy/deletion-requests/${req.id}/transition`).send({ to });

    expect((await get(member, "/account/privacy").expect(200)).body.deletionRequests[0]).toMatchObject({ id: req.id, state: "REQUESTED", cancellable: true, executionEnabled: false });
    await get(member, "/admin/privacy/deletion-requests").expect(403);
    await get(support, "/admin/privacy/deletion-requests").expect(403);
    await transition(support, "PENDING_RETENTION").expect(403);
    expect((await transition(admin, "COMPLETED").expect(400)).body.error.details.reason).toBe("EXECUTION_DISABLED");
    expect((await transition(admin, "READY_FOR_EXECUTION").expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");
    expect((await transition(admin, "PENDING_RETENTION").expect(201)).body.state).toBe("PENDING_RETENTION");
    expect((await transition(admin, "READY_FOR_EXECUTION").expect(400)).body.error.details.reason).toBe("RETENTION_POLICY_NOT_APPROVED");
    expect((await get(admin, "/admin/privacy/deletion-requests?state=PENDING_RETENTION").expect(200)).body.map((r: { id: string }) => r.id)).toContain(req.id);
    expect(await db.adminAuditLog.count({ where: { entityId: req.id, action: "account_deletion.state_changed" } })).toBe(1);
    expect(await db.domainEvent.count({ where: { type: "AccountDeletionStateChanged", aggregateId: member.id } })).toBe(1);

    // Another member can't cancel it; the owner can, while still pending retention.
    await send("post", await actor("other"), `/account/privacy/deletion/${req.id}/cancel`).expect(404);
    await send("post", member, `/account/privacy/deletion/${req.id}/cancel`).expect((r) => expect(r.status).toBeLessThan(300));
    expect(await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ state: "CANCELLED", status: "CANCELLED" });
    expect((await transition(admin, "PENDING_RETENTION").expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");
    // The account itself is untouched: nothing executes.
    expect(await db.user.count({ where: { id: member.id } })).toBe(1);
  });

  it("consent history records each accept and withdrawal with version and source", async () => {
    const member = await actor("member");
    await send("patch", member, "/account/privacy/consent").send({ kind: "MARKETING", granted: true }).expect(200);
    await send("patch", member, "/account/privacy/consent").send({ kind: "MARKETING", granted: false }).expect(200);
    await send("patch", member, "/account/privacy/consent").send({ kind: "TERMS", granted: true }).expect(200);
    await send("patch", member, "/account/privacy/consent").send({ kind: "TERMS", granted: false }).expect(400);
    const history = (await get(member, "/account/privacy/consents/history").expect(200)).body;
    const marketing = history.items.filter((i: { kind: string }) => i.kind === "MARKETING");
    expect(marketing).toHaveLength(2);
    expect(marketing[0]).toMatchObject({ version: history.currentVersion, acceptedAt: null, source: "PRIVACY_CENTER" });
    expect(marketing[0].withdrawnAt).toBeTruthy();
    expect(marketing[1].acceptedAt).toBeTruthy();
    expect(history.items.filter((i: { kind: string }) => i.kind === "TERMS")).toHaveLength(1);
    // Someone else's history is never visible.
    expect((await get(await actor("other"), "/account/privacy/consents/history").expect(200)).body.items).toEqual([]);
  });

  it("release gate: SUPER_ADMIN only, every key reported, not ready in test", async () => {
    const admin = await actor("admin", AdminRole.SUPER_ADMIN);
    await get(await actor("member"), "/admin/release-gate").expect(403);
    const gate = (await get(admin, "/admin/release-gate").expect(200)).body;
    expect(gate.items.map((i: { key: string }) => i.key)).toEqual(["NODE_ENV_PRODUCTION", "TLS_ENABLED", "SECURE_COOKIES", "REAL_OTP_PROVIDER", "REAL_MESSAGING", "PAYMENT_PRODUCTION_DECISION", "RETENTION_POLICY_APPROVED", "DEV_SIMULATION_DISABLED"]);
    expect(gate.readyForRealUsers).toBe(false);
    expect(JSON.stringify(gate)).not.toMatch(/secret|key=|password/i);
  });
});
