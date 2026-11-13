import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { base32Decode, hotp, totpStep } from "../src/modules/admin/two-step/totp";

type Actor = { userId: string; adminUserId?: string; cookie: string; csrf: string };

/** Admin two-step sign-in (TOTP, market-readiness Q75): enrol, challenge per session, replay/lock rules, policy, reset. */
describe("Admin two-step sign-in", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const code = (secret: string, offset = 0) => hotp(base32Decode(secret), totpStep() + offset);

  async function session(userId: string, adminUserId?: string): Promise<Actor> {
    const row = await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + 86400000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { userId, adminUserId, csrf, cookie: `petlife_session=${signSessionCookie(row.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function admin(name: string, role: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `twostep-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    const row = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return session(user.id, row.id);
  }
  async function enrol(a: Actor): Promise<{ secret: string; recoveryCodes: string[] }> {
    const started = (await send("post", a, "/admin/two-step/enrolment").expect(201)).body;
    expect(started.otpauthUri).toMatch(/^otpauth:\/\/totp\/opetlife\.ir:/);
    const recoveryCodes = (await send("post", a, "/admin/two-step/enrolment/confirm").send({ code: code(started.secret) }).expect(201)).body.recoveryCodes;
    return { secret: started.secret, recoveryCodes };
  }
  const policyOff = () => db.adminTwoStepPolicy.deleteMany({});

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
    await policyOff();
  });
  afterAll(async () => {
    delete process.env.ADMIN_TWO_STEP_ENFORCEMENT;
  });
  afterAll(async () => {
    await policyOff();
    await app.close();
  });

  it("enrolment, one challenge per session, no replays, single-use recovery codes and a lock after five misses", async () => {
    const support = await admin("two-step support", AdminRole.SUPPORT);
    expect((await get(support, "/admin/me").expect(200)).body.twoStep).toEqual({ enrolled: false, verified: false, enforced: false, graceEndsAt: null, required: "NONE" });
    await get(support, "/admin/support").expect(200);

    const started = (await send("post", support, "/admin/two-step/enrolment").expect(201)).body;
    await send("post", support, "/admin/two-step/enrolment/confirm").send({ code: code(started.secret, 5) }).expect(400);
    const stored = await db.adminTwoStepFactor.findUniqueOrThrow({ where: { userId: support.userId } });
    expect(stored.confirmedAt).toBeNull();
    expect(stored.secretCiphertext).not.toContain(started.secret.replace(/ /g, ""));
    const confirmed = (await send("post", support, "/admin/two-step/enrolment/confirm").send({ code: code(started.secret) }).expect(201)).body;
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(await db.adminTwoStepRecoveryCode.count({ where: { userId: support.userId, codeHash: { in: confirmed.recoveryCodes } } })).toBe(0);
    await send("post", support, "/admin/two-step/enrolment").expect(409);
    // The enrolling session is through; a new sign-in is not.
    await get(support, "/admin/support").expect(200);
    const laptop = await session(support.userId);
    const blocked = (await get(laptop, "/admin/support").expect(403)).body.error;
    expect(blocked).toMatchObject({ code: "ADMIN_TWO_STEP_REQUIRED", details: { reason: "CHALLENGE" } });
    expect((await get(laptop, "/admin/me").expect(200)).body.twoStep).toMatchObject({ enrolled: true, verified: false, required: "CHALLENGE" });
    await get(laptop, "/admin/two-step").expect(200);
    await get(laptop, "/admin/two-step/policy").expect(403);

    // The code used to confirm can't be used again; the next step's code can, once.
    await send("post", laptop, "/admin/two-step/verify").send({ code: code(started.secret) }).expect(400);
    await send("post", laptop, "/admin/two-step/verify").send({ code: code(started.secret, 1) }).expect(201);
    await get(laptop, "/admin/support").expect(200);
    const phone = await session(support.userId);
    await send("post", phone, "/admin/two-step/verify").send({ code: code(started.secret, 1) }).expect(400);

    // Recovery codes work once each.
    const recovery = confirmed.recoveryCodes[0].toLowerCase().replace(/-/g, " ");
    expect((await send("post", phone, "/admin/two-step/verify").send({ recoveryCode: recovery }).expect(201)).body.recoveryCodesLeft).toBe(9);
    await get(phone, "/admin/support").expect(200);
    const tablet = await session(support.userId);
    const reused = (await send("post", tablet, "/admin/two-step/verify").send({ recoveryCode: confirmed.recoveryCodes[0] }).expect(400)).body.error;
    expect(reused).toMatchObject({ code: "TWO_STEP_CODE_INVALID", details: { attemptsLeft: 4 } });
    for (let i = 0; i < 3; i++) await send("post", tablet, "/admin/two-step/verify").send({ code: "000000" }).expect(400);
    const locked = (await send("post", tablet, "/admin/two-step/verify").send({ code: "000000" }).expect(429)).body.error;
    expect(locked.code).toBe("TWO_STEP_LOCKED");
    await send("post", tablet, "/admin/two-step/verify").send({ recoveryCode: confirmed.recoveryCodes[1] }).expect(429);
    await get(tablet, "/admin/support").expect(403);
    // A second lock-out before any success lasts an hour, not 15 minutes.
    await db.adminTwoStepFactor.update({ where: { userId: support.userId }, data: { lockedUntil: null } });
    for (let i = 0; i < 4; i++) await send("post", tablet, "/admin/two-step/verify").send({ code: "000000" }).expect(400);
    const relocked = (await send("post", tablet, "/admin/two-step/verify").send({ code: "000000" }).expect(429)).body.error;
    expect(new Date(relocked.details.retryAt).getTime() - Date.now()).toBeGreaterThan(55 * 60 * 1000);

    // Regenerating recovery codes needs a fresh authenticator code and retires the old set.
    await db.adminTwoStepFactor.update({ where: { userId: support.userId }, data: { lockedUntil: null, lastUsedStep: 0 } });
    // Typed on a Persian keyboard, with a direction mark: the same code.
    const persian = `\u200F${code(started.secret, -1).replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)))}`;
    const fresh = (await send("post", laptop, "/admin/two-step/recovery-codes").send({ code: persian }).expect(201)).body.recoveryCodes;
    expect(fresh).toHaveLength(10);
    await send("post", tablet, "/admin/two-step/verify").send({ recoveryCode: confirmed.recoveryCodes[1] }).expect(400);
    await send("post", tablet, "/admin/two-step/verify").send({ recoveryCode: fresh[0] }).expect(201);

    const actions = (await db.adminAuditLog.findMany({ where: { adminUserId: support.adminUserId, action: { startsWith: "admin_two_step." } } })).map((r) => r.action).sort();
    expect(actions).toEqual(["admin_two_step.enrolled", "admin_two_step.locked", "admin_two_step.locked", "admin_two_step.recovery_code_used", "admin_two_step.recovery_code_used", "admin_two_step.recovery_codes_regenerated"]);
  });

  it("opt-in by default (owner 2026-11-13): enforcement can't be switched on, and a stored policy never locks anyone out", async () => {
    delete process.env.ADMIN_TWO_STEP_ENFORCEMENT;
    const root = await admin("opt-in root", AdminRole.SUPER_ADMIN);
    const ops = await admin("opt-in ops", AdminRole.ADMIN);
    await enrol(root);
    const refused = await send("put", root, "/admin/two-step/policy").send({ enforced: true, graceDays: 0, reason: "Protect every admin account" }).expect(409);
    expect(refused.body.error.details.rule).toBe("TWO_STEP_ENFORCEMENT_NOT_AVAILABLE");
    expect((await get(root, "/admin/two-step/policy").expect(200)).body).toMatchObject({ enforced: false, enforcementAvailable: false });
    // Even a policy row written straight to the database (e.g. by an earlier build) does not block an unenrolled admin.
    await db.adminTwoStepPolicy.upsert({ where: { id: 1 }, create: { id: 1, enforcedAt: new Date(Date.now() - 86400000), graceDays: 0 }, update: { enforcedAt: new Date(Date.now() - 86400000), graceDays: 0 } });
    expect((await get(ops, "/admin/me").expect(200)).body.twoStep).toMatchObject({ enforced: false, required: "NONE" });
    await get(ops, "/admin/dashboard").expect(200);
    await policyOff();
  });

  it("enforcement: SUPER_ADMIN only, after enrolling; grace window; reset of a lost authenticator; off again", async () => {
    process.env.ADMIN_TWO_STEP_ENFORCEMENT = "on";
    const root = await admin("two-step root", AdminRole.SUPER_ADMIN);
    const ops = await admin("two-step ops", AdminRole.ADMIN);
    const body = { enforced: true, graceDays: 0, reason: "Protect every admin account" };
    await send("put", ops, "/admin/two-step/policy").send(body).expect(403);
    expect((await send("put", root, "/admin/two-step/policy").send(body).expect(409)).body.error.details.rule).toBe("TWO_STEP_SELF_ENROLMENT_REQUIRED");
    await enrol(root);
    const opsFactor = await enrol(ops);
    const policy = (await send("put", root, "/admin/two-step/policy").send(body).expect(200)).body;
    expect(policy).toMatchObject({ enforced: true, graceDays: 0 });
    expect(policy.members.find((m: { adminUserId: string }) => m.adminUserId === ops.adminUserId)).toMatchObject({ enrolled: true, graceEndsAt: null });

    // An admin without an authenticator can only enrol now…
    const newcomer = await admin("two-step newcomer", AdminRole.SUPPORT);
    expect((await get(newcomer, "/admin/support").expect(403)).body.error.details.reason).toBe("ENROL");
    expect((await get(newcomer, "/admin/two-step").expect(200)).body.required).toBe("ENROL");
    await enrol(newcomer);
    await get(newcomer, "/admin/support").expect(200);
    // …unless the grace window is still open.
    await send("put", root, "/admin/two-step/policy").send({ ...body, graceDays: 3 }).expect(200);
    const later = await admin("two-step later", AdminRole.SUPPORT);
    await get(later, "/admin/support").expect(200);
    expect((await get(later, "/admin/me").expect(200)).body.twoStep).toMatchObject({ enforced: true, required: "NONE", graceEndsAt: expect.any(String) });

    // Nobody turns their own off while it is enforced; a lost authenticator is reset by a SUPER_ADMIN.
    expect((await send("post", ops, "/admin/two-step/disable").send({ code: code(opsFactor.secret, 1) }).expect(409)).body.error.details.rule).toBe("TWO_STEP_ENFORCED");
    expect((await send("post", root, `/admin/two-step/members/${root.adminUserId}/reset`).send({ reason: "testing self reset" }).expect(409)).body.error.details.rule).toBe("TWO_STEP_SELF_RESET");
    await send("post", ops, `/admin/two-step/members/${newcomer.adminUserId}/reset`).send({ reason: "lost phone" }).expect(403);
    await send("post", root, `/admin/two-step/members/${ops.adminUserId}/reset`).send({ reason: "Lost phone, confirmed by call" }).expect(201);
    expect(await db.adminTwoStepFactor.count({ where: { userId: ops.userId } })).toBe(0);
    expect(await db.session.count({ where: { userId: ops.userId, twoStepVerifiedAt: { not: null } } })).toBe(0);
    expect((await get(ops, "/admin/me").expect(200)).body.twoStep).toMatchObject({ enrolled: false, verified: false });
    const reset = await db.adminAuditLog.findFirstOrThrow({ where: { adminUserId: root.adminUserId, action: "admin_two_step.reset", entityId: ops.adminUserId } });
    expect(reset.reason).toBe("Lost phone, confirmed by call");

    // Off again: back to optional, and an unenrolled admin works without enrolling.
    await send("put", root, "/admin/two-step/policy").send({ enforced: false, graceDays: 7, reason: "End of the drill" }).expect(200);
    expect((await get(ops, "/admin/me").expect(200)).body.twoStep).toMatchObject({ enforced: false, required: "NONE" });
    await get(ops, "/admin/access/admins").expect(200);
    expect(await db.adminAuditLog.count({ where: { adminUserId: root.adminUserId, action: "admin_two_step.policy_changed" } })).toBe(3);
  });
});
