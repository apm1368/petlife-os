import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import type Redis from "ioredis";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { REDIS_CLIENT } from "../src/common/redis/redis.module";
import { AccountExportService } from "../src/modules/account/account-export.service";
import { NotificationOrchestratorService } from "../src/modules/notifications/notification-orchestrator.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

/**
 * Batch 8 — Account, security, privacy, household access, notifications and
 * membership through the real HTTP surface.
 */
describe("Batch 8 — Account & security", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let logSpy: jest.SpyInstance;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
  });

  /** Tests reuse identifiers faster than the real resend cooldown allows. */
  async function clearOtpCooldown(identifier: string) {
    await redis.del(`otp:cooldown:${identifier}`);
  }

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uniquePhone = () => `0912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

  function lastOtp(identifier: string): string {
    const calls = logSpy.mock.calls.filter((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(`identifier=${identifier} `));
    const call = calls[calls.length - 1];
    if (!call) throw new Error(`No OTP log found for ${identifier}`);
    return /code=(\d+)/.exec(call[0] as string)![1]!;
  }

  async function csrf(): Promise<string> {
    const primed = await request(server).get("/health/live");
    return extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
  }

  async function signIn(identifier: string): Promise<Cookies> {
    await clearOtpCooldown(identifier);
    const token = await csrf();
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier }).expect(200);
    const verify = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier, code: lastOtp(identifier) }).expect(200);
    return { session: extractCookie(verify.headers["set-cookie"], "petlife_session"), csrf: token };
  }

  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      cookies,
      get: (url: string) => request(server).get(url).set("Cookie", cookie),
      post: (url: string) => request(server).post(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (url: string) => request(server).patch(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (url: string) => request(server).put(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (url: string) => request(server).delete(url).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  type Client = ReturnType<typeof client>;

  async function user(prefix = "b8-user") {
    const email = `${prefix}-${unique()}@example.com`;
    const c = client(await signIn(email));
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { c, userId: row.id, email };
  }

  async function register(username: string, password: string, email?: string) {
    const token = await csrf();
    const res = await request(server).post("/auth/register").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ username, password, email }).expect(200);
    return client({ session: extractCookie(res.headers["set-cookie"], "petlife_session"), csrf: token });
  }

  async function passwordLogin(username: string, password: string) {
    const token = await csrf();
    return request(server).post("/auth/login/password").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ username, password });
  }

  async function owner(petName = "Cookie") {
    const u = await user("b8-owner");
    const household = await u.c.post("/households").send({}).expect(201);
    const pet = await u.c.post(`/households/${household.body.id}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 30 }).expect(201);
    return { ...u, householdId: household.body.id as string, petId: pet.body.id as string };
  }

  /** Invites `member` with the given preset and returns the raw token from the delivered notification link. */
  async function invite(o: Awaited<ReturnType<typeof owner>>, member: { c: Client; email: string; userId: string }, preset: "VIEW_ONLY" | "CARE_HELPER" | "FULL" = "VIEW_ONLY") {
    await o.c.post(`/households/${o.householdId}/invitations`).send({ contact: member.email, initialAccess: [{ petId: o.petId, preset }] }).expect(201);
    const note = await prisma.notification.findFirst({ where: { userId: member.userId, type: "household.invited" }, orderBy: { createdAt: "desc" } });
    return note!.deepLink!.split("/invitations/")[1]!;
  }

  async function memberIdOf(householdId: string, userId: string) {
    return (await prisma.householdMember.findUniqueOrThrow({ where: { householdId_userId: { householdId, userId } } })).id;
  }

  // ------------------------------------------------------------------ 8A account & profile

  describe("profile and contact methods", () => {
    it("never returns the password hash, and reports contact verification honestly", async () => {
      const u = await user();
      const changed = await u.c.put("/auth/password").send({ newPassword: "correct horse battery" }).expect(200);
      // This device keeps working on a rotated session id; the old id is dead.
      const relogged = client({ session: extractCookie(changed.headers["set-cookie"], "petlife_session"), csrf: u.c.cookies.csrf });
      expect(relogged.cookies.session).not.toBe(u.c.cookies.session);
      await u.c.get("/me").expect(401);
      const me = await relogged.get("/me").expect(200);
      expect(me.body).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(me.body)).not.toContain("argon2");
      expect(me.body).toMatchObject({ email: u.email, emailVerified: true, phone: null, phoneVerified: false, hasPassword: true });
      const patched = await relogged.patch("/me").send({ displayName: "  Sara  " }).expect(200);
      expect(patched.body).not.toHaveProperty("passwordHash");
      expect(patched.body.displayName).toBe("Sara");
    });

    it("a new phone only takes effect with the code sent to it, and a taken contact is refused only at confirmation", async () => {
      const u = await user();
      const phone = uniquePhone();
      await u.c.post("/me/contact/request").send({ kind: "phone", value: phone }).expect(200);
      await u.c.post("/me/contact/confirm").send({ kind: "phone", value: phone, code: "000000" }).expect(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).phone).toBeNull();
      const done = await u.c.post("/me/contact/confirm").send({ kind: "phone", value: phone, code: lastOtp(phone) }).expect(200);
      expect(done.body).toMatchObject({ phone, phoneVerified: true });
      expect(await prisma.domainEvent.count({ where: { type: "ContactChanged", aggregateId: u.userId } })).toBe(1);

      // Asking for a code for someone else's email looks exactly like any other request (no account probing)…
      const other = await user("b8-other");
      await clearOtpCooldown(other.email);
      await u.c.post("/me/contact/request").send({ kind: "email", value: other.email }).expect(200);
      // …but it can never be attached to this account.
      const clash = await u.c.post("/me/contact/confirm").send({ kind: "email", value: other.email, code: lastOtp(other.email) }).expect(409);
      expect(clash.body.error.code).toBe("CONTACT_UNAVAILABLE");
      // A kind/value mismatch is rejected.
      await u.c.post("/me/contact/request").send({ kind: "phone", value: "someone@example.com" }).expect(409);
      // Anonymous callers can't use it.
      const token = await csrf();
      await request(server).post("/me/contact/request").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ kind: "phone", value: uniquePhone() }).expect(401);
    });

    it("pre-account-takeover: proving an email that someone else typed at sign-up locks the stranger out", async () => {
      const victimEmail = `b8-victim-${unique()}@example.com`;
      const username = `squatter_${Date.now()}`;
      const squatter = await register(username, "squatter-password-1", victimEmail);
      await squatter.get("/me").expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: victimEmail } })).emailVerifiedAt).toBeNull();

      // The real owner signs in with a code sent to their inbox.
      const victim = client(await signIn(victimEmail));
      const me = await victim.get("/me").expect(200);
      expect(me.body).toMatchObject({ emailVerified: true, hasPassword: false });
      // The squatter's session and password no longer work.
      await squatter.get("/me").expect(401);
      await passwordLogin(username, "squatter-password-1").then((r) => expect(r.status).toBe(401));
      expect(await prisma.domainEvent.count({ where: { type: "UnverifiedCredentialsCleared", aggregateId: me.body.id } })).toBe(1);
    });

    it("an OTP code works once, even when submitted twice at the same moment", async () => {
      const email = `b8-race-${unique()}@example.com`;
      const token = await csrf();
      await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: email }).expect(200);
      const code = lastOtp(email);
      const attempt = () => request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: email, code });
      const results = await Promise.all([attempt(), attempt(), attempt()]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ 8B household & access

  describe("household membership and pet access", () => {
    it("invitations are single-use, bound to the invited person, and never duplicate a member or their grants", async () => {
      const o = await owner();
      const member = await user("b8-member");
      const stranger = await user("b8-stranger");
      const token = await invite(o, member, "VIEW_ONLY");
      await stranger.c.get(`/household-invitations/${token}`).expect(403);
      await stranger.c.post(`/household-invitations/${token}/accept`).expect(403);
      await member.c.post(`/household-invitations/${token}/accept`).expect(201);
      await member.c.post(`/household-invitations/${token}/accept`).expect(404);
      expect(await prisma.petAccessGrant.count({ where: { petId: o.petId, userId: member.userId, revokedAt: null } })).toBe(1);
      const dup = await o.c.post(`/households/${o.householdId}/invitations`).send({ contact: member.email, initialAccess: [] }).expect(409);
      expect(dup.body.error.code).toBe("ALREADY_HOUSEHOLD_MEMBER");

      // An expired invitation can't be accepted.
      const late = await user("b8-late");
      const lateToken = await invite(o, late);
      await prisma.householdInvitation.updateMany({ where: { householdId: o.householdId, status: "PENDING" }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await late.c.post(`/household-invitations/${lateToken}/accept`).expect(400);
      expect(await prisma.householdMember.count({ where: { householdId: o.householdId, userId: late.userId } })).toBe(0);
    });

    it("removing a member ends their household-issued access at once and tells them why pages are closed", async () => {
      const o = await owner();
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member, "CARE_HELPER")}/accept`).expect(201);
      await member.c.get(`/pets/${o.petId}`).expect(200);
      const memberId = await memberIdOf(o.householdId, member.userId);

      // A family member cannot remove anyone; another household's owner can't touch this one.
      const outsider = await owner("Other");
      await member.c.delete(`/households/${o.householdId}/members/${await memberIdOf(o.householdId, o.userId)}`).expect(403);
      await outsider.c.delete(`/households/${o.householdId}/members/${memberId}`).expect(403);
      await outsider.c.delete(`/households/${outsider.householdId}/members/${memberId}`).expect(404);

      await o.c.delete(`/households/${o.householdId}/members/${memberId}`).expect(200);
      const denied = await member.c.get(`/pets/${o.petId}`).expect(403);
      expect(denied.body.error.details.lapse.reason).toBe("REVOKED");
      expect(await prisma.householdMember.count({ where: { householdId: o.householdId, userId: member.userId } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: member.userId, type: "household.member_removed" } })).toBe(1);
      expect(await prisma.domainEvent.count({ where: { type: "HouseholdMemberRemoved", aggregateId: o.householdId } })).toBe(1);
      // A stranger who never had access gets no lapse detail.
      const never = await user("b8-never");
      const strangerDenied = await never.c.get(`/pets/${o.petId}`).expect(403);
      expect(strangerDenied.body.error.details?.lapse).toBeUndefined();
    });

    it("a household always keeps an owner: the last owner can't leave or be demoted until someone else is promoted", async () => {
      const o = await owner();
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member)}/accept`).expect(201);
      const ownerMemberId = await memberIdOf(o.householdId, o.userId);
      const memberId = await memberIdOf(o.householdId, member.userId);

      expect((await o.c.post(`/households/${o.householdId}/leave`).expect(409)).body.error.code).toBe("LAST_HOUSEHOLD_OWNER");
      await o.c.patch(`/households/${o.householdId}/members/${ownerMemberId}`).send({ role: "FAMILY" }).expect(409);
      await member.c.patch(`/households/${o.householdId}/members/${memberId}`).send({ role: "OWNER" }).expect(403);

      await o.c.patch(`/households/${o.householdId}/members/${memberId}`).send({ role: "OWNER" }).expect(200);
      // The promoted owner can now manage the pet's access.
      const grants = await member.c.get(`/pets/${o.petId}/access-grants`).expect(200);
      expect(Array.isArray(grants.body)).toBe(true);
      await o.c.post(`/households/${o.householdId}/leave`).expect(201);
      await o.c.get(`/pets/${o.petId}`).expect(403);
      await member.c.get(`/pets/${o.petId}`).expect(200);
    });

    it("temporary access works only inside its window and then reports itself as expired", async () => {
      const o = await owner();
      const sitter = await user("b8-sitter");
      await sitter.c.post(`/household-invitations/${await invite(o, sitter)}/accept`).expect(201);
      // Remove the standing view grant so only the temporary one applies.
      await prisma.petAccessGrant.updateMany({ where: { petId: o.petId, userId: sitter.userId }, data: { revokedAt: new Date(Date.now() - 60 * 60 * 1000) } });
      const flags = { canViewIdentity: true, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false, canViewCareProfile: true, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false };
      const grant = await o.c.post(`/pets/${o.petId}/access-grants`).send({ userId: sitter.userId, ...flags, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), reason: "Weekend sitting" }).expect(201);
      expect(grant.body.source).toBe("TEMPORARY");
      await sitter.c.get(`/pets/${o.petId}`).expect(200);
      await prisma.petAccessGrant.update({ where: { id: grant.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const denied = await sitter.c.get(`/pets/${o.petId}`).expect(403);
      expect(denied.body.error.details.lapse.reason).toBe("EXPIRED");
      // The sitter can't extend their own access.
      await sitter.c.patch(`/pets/${o.petId}/access-grants/${grant.body.id}`).send({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(403);
    });
  });


  // ------------------------------------------------------------------ 8C security center

  describe("sessions and security notices", () => {
    it("a user sees and ends only their own sessions; other devices stop working at once", async () => {
      const u = await user("b8-sessions");
      const phone = client(await signIn(u.email));
      const tablet = client(await signIn(u.email));
      const list = await u.c.get("/account/security").expect(200);
      expect(list.body.sessions).toHaveLength(3);
      expect(list.body.sessions.filter((x: { current: boolean }) => x.current)).toHaveLength(1);
      expect(JSON.stringify(list.body.sessions)).not.toContain("ipAddress");

      // Someone else's session id is indistinguishable from an inactive one, and stays alive.
      const other = await user("b8-other");
      const otherSession = (await other.c.get("/account/security").expect(200)).body.sessions[0].id as string;
      await u.c.delete(`/account/security/sessions/${otherSession}`).expect(400);
      await other.c.get("/me").expect(200);
      await u.c.delete("/account/security/sessions/not-a-uuid").expect(400);

      // The current session can't be ended from the list (that's "sign out").
      const currentId = list.body.sessions.find((x: { current: boolean }) => x.current).id as string;
      await u.c.delete(`/account/security/sessions/${currentId}`).expect(400);

      const tabletId = (await tablet.get("/account/security").expect(200)).body.sessions.find((x: { current: boolean }) => x.current).id as string;
      await u.c.delete(`/account/security/sessions/${tabletId}`).expect(200);
      await tablet.get("/me").expect(401);
      await phone.get("/me").expect(200);

      const others = await u.c.post("/account/security/sessions/revoke-others").expect(201);
      expect(others.body.count).toBe(1);
      await phone.get("/me").expect(401);
      await u.c.get("/me").expect(200);
      expect(await prisma.notification.count({ where: { userId: u.userId, type: "security.sessions_revoked" } })).toBe(1);
    });

    it("sign out everywhere ends this session too, and a revoked session can't race past revocation", async () => {
      const u = await user("b8-everywhere");
      const second = client(await signIn(u.email));
      // Requests in flight with the soon-revoked session either finish before or fail after — never succeed afterwards.
      const inflight = Promise.all(Array.from({ length: 5 }, () => second.get("/me")));
      const res = await u.c.post("/account/security/sessions/revoke-all").expect(200);
      expect(res.body.count).toBe(2);
      await inflight;
      await u.c.get("/me").expect(401);
      await second.get("/me").expect(401);
      expect(await prisma.session.count({ where: { userId: u.userId, revokedAt: null } })).toBe(0);
    });

    it("security notices: a later sign-in and a password change notify; the very first sign-in does not", async () => {
      const u = await user("b8-notices");
      expect(await prisma.notification.count({ where: { userId: u.userId, type: "security.new_sign_in" } })).toBe(0);
      await signIn(u.email);
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: u.userId, type: "security.new_sign_in" } });
      expect(note.category).toBe("SECURITY");
      expect(note.deepLink).toBe("/profile/security");
      const changed = await u.c.put("/auth/password").send({ newPassword: "a brand new password" }).expect(200);
      expect(await prisma.notification.count({ where: { userId: u.userId, type: "security.password_changed" } })).toBe(1);
      const rotated = client({ session: extractCookie(changed.headers["set-cookie"], "petlife_session"), csrf: u.c.cookies.csrf });
      // Security notices can't be switched off.
      await rotated.patch("/notification-preferences").send({ preferences: [{ category: "SECURITY", channel: "IN_APP", enabled: false }] }).expect(200);
      const prefs = await rotated.get("/notification-preferences").expect(200);
      expect(prefs.body.preferences.find((p: { category: string; channel: string }) => p.category === "SECURITY" && p.channel === "IN_APP").enabled).toBe(true);
    });

    it("password reset links are single-use, die when another is used, and don't reveal whether an account exists", async () => {
      const username = `b8reset_${Date.now()}`;
      const email = `b8-reset-${unique()}@example.com`;
      await register(username, "first-password-1", email);
      const token = await csrf();
      const forgot = (identifier: string) => request(server).post("/auth/password/forgot").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier });
      const known = await forgot(email).expect(200);
      const unknown = await forgot(`nobody-${unique()}@example.com`).expect(200);
      expect(known.body).toEqual(unknown.body);
      await forgot(username).expect(200);
      const tokens = logSpy.mock.calls.map((c) => String(c[0])).filter((line) => line.includes("[DEV PASSWORD RESET]")).map((line) => /token=(\S+)/.exec(line)![1]!);
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      const [first, second] = tokens.slice(-2);
      const reset = (t: string, pw: string) => request(server).post("/auth/password/reset").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ token: t, newPassword: pw });
      const race = await Promise.all([reset(second!, "second-password-2"), reset(second!, "second-password-3")]);
      expect(race.filter((r) => r.status === 200)).toHaveLength(1);
      await reset(first!, "first-link-reused").expect(400);
    });
  });


  // ------------------------------------------------------------------ 8D privacy, export and deletion

  describe("privacy center", () => {
    it("required agreements can be accepted but not withdrawn; marketing is a real opt-in that gates marketing messages", async () => {
      const u = await user("b8-privacy");
      const before = await u.c.get("/account/privacy").expect(200);
      expect(before.body.consents.find((c: { kind: string }) => c.kind === "TERMS")).toMatchObject({ required: true, granted: false });
      await u.c.patch("/account/privacy/consent").send({ kind: "TERMS", granted: true }).expect(200);
      expect((await u.c.patch("/account/privacy/consent").send({ kind: "PRIVACY", granted: false }).expect(400)).body.error.code).toBe("CONSENT_REQUIRED");

      let prefs = await u.c.get("/notification-preferences").expect(200);
      expect(prefs.body.marketingConsentGranted).toBe(false);
      expect(prefs.body.preferences.filter((p: { category: string }) => p.category === "MARKETING").every((p: { enabled: boolean }) => !p.enabled)).toBe(true);
      expect(prefs.body.requiredCategories).toContain("SECURITY");
      expect(prefs.body.channels).toEqual(expect.arrayContaining([{ channel: "IN_APP", delivery: "LIVE" }, { channel: "SMS", delivery: "SANDBOX" }]));

      await u.c.patch("/account/privacy/consent").send({ kind: "MARKETING", granted: true }).expect(200);
      prefs = await u.c.get("/notification-preferences").expect(200);
      expect(prefs.body.preferences.find((p: { category: string; channel: string }) => p.category === "MARKETING" && p.channel === "IN_APP").enabled).toBe(true);
      await u.c.patch("/account/privacy/consent").send({ kind: "MARKETING", granted: false }).expect(200);
      prefs = await u.c.get("/notification-preferences").expect(200);
      expect(prefs.body.marketingConsentGranted).toBe(false);
    });

    it("sharing summary lists who can see your pets and what you can see of others'", async () => {
      const o = await owner();
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member, "CARE_HELPER")}/accept`).expect(201);
      const sharing = await o.c.get("/account/privacy/sharing").expect(200);
      expect(sharing.body.sharedByYou).toEqual([expect.objectContaining({ person: expect.any(String), kind: "HOUSEHOLD", canViewHealth: true, pet: { id: o.petId, name: "Cookie" } })]);
      const theirs = await member.c.get("/account/privacy/sharing").expect(200);
      expect(theirs.body.sharedByYou).toHaveLength(0);
    });

    it("an export is built in the background into a private file, downloaded only by its owner through a short-lived link, and expires", async () => {
      const o = await owner("Biscuit");
      await prisma.allergy.create({ data: { petId: o.petId, name: "Chicken", knowledgeState: "KNOWN", status: "ACTIVE", sourceType: "OWNER" } });
      const requested = await o.c.post("/account/privacy/exports").expect(201);
      expect(requested.body.status).toBe("PENDING");
      // A second request while one is pending returns the same one.
      expect((await o.c.post("/account/privacy/exports").expect(201)).body.id).toBe(requested.body.id);

      const worker = app.get(AccountExportService);
      expect(await worker.processQueue()).toBeGreaterThanOrEqual(1);
      const privacy = await o.c.get("/account/privacy").expect(200);
      const ready = privacy.body.exports.find((e: { id: string }) => e.id === requested.body.id);
      expect(ready).toMatchObject({ status: "READY", downloadCount: 0 });
      expect(ready).not.toHaveProperty("fileObjectKey");

      // Someone else can't mint a download for it.
      const stranger = await user("b8-stranger");
      await stranger.c.post(`/account/privacy/exports/${requested.body.id}/download`).expect(404);
      const link = await o.c.post(`/account/privacy/exports/${requested.body.id}/download`).expect(200);
      expect(link.body.expiresInSeconds).toBeLessThanOrEqual(300);
      const file = await request(server).get(new URL(link.body.downloadUrl).pathname).expect(200);
      expect(file.headers["content-disposition"]).toContain("attachment");
      const exported = JSON.parse(file.text);
      expect(exported.account).toMatchObject({ id: o.userId, email: o.email });
      expect(exported.pets[0]).toMatchObject({ name: "Biscuit" });
      expect(exported.pets[0].health.allergies.items[0]).toMatchObject({ name: "Chicken" });
      expect(file.text).not.toContain("passwordHash");
      expect(file.text).not.toContain("tokenHash");
      // The private file is never reachable through the public static route.
      const key = (await prisma.dataExportRequest.findUniqueOrThrow({ where: { id: requested.body.id } })).fileObjectKey!;
      await request(server).get(`/uploads/${key}`).expect(404);
      expect(await prisma.domainEvent.count({ where: { type: "DataExportDownloaded", aggregateId: o.userId } })).toBe(1);

      // After the window closes the file is removed and the link can't be minted.
      await prisma.dataExportRequest.update({ where: { id: requested.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await worker.processQueue();
      expect((await prisma.dataExportRequest.findUniqueOrThrow({ where: { id: requested.body.id } })).status).toBe("EXPIRED");
      await o.c.post(`/account/privacy/exports/${requested.body.id}/download`).expect(404);
    });

    it("a member's export includes health only for pets they may view health for, and never another member's memories", async () => {
      const o = await owner("Pixel");
      await prisma.petMemory.create({ data: { petId: o.petId, householdId: o.householdId, createdByUserId: o.userId, type: "STORY", title: "Owner-only memory", occurredAt: new Date(), visibility: "PRIVATE" } });
      await prisma.allergy.create({ data: { petId: o.petId, name: "Beef", knowledgeState: "KNOWN", status: "ACTIVE", sourceType: "OWNER" } });
      const viewer = await user("b8-viewer");
      await viewer.c.post(`/household-invitations/${await invite(o, viewer, "VIEW_ONLY")}/accept`).expect(201);
      const req = await viewer.c.post("/account/privacy/exports").expect(201);
      await app.get(AccountExportService).processQueue();
      const link = await viewer.c.post(`/account/privacy/exports/${req.body.id}/download`).expect(200);
      const text = (await request(server).get(new URL(link.body.downloadUrl).pathname).expect(200)).text;
      const exported = JSON.parse(text);
      expect(exported.pets[0].name).toBe("Pixel");
      expect(exported.pets[0]).not.toHaveProperty("health");
      expect(text).not.toContain("Owner-only memory");
      expect(text).not.toContain("Beef");
      expect(exported.households[0].subscription?.periods).toBeUndefined();
    });

    it("deletion is a confirmed, re-authenticated request that open obligations block, and it can be cancelled", async () => {
      const o = await owner();
      const preview = await o.c.get("/account/privacy/deletion/preview").expect(200);
      expect(preview.body).toMatchObject({ canRequest: true, blockers: [], retention: { policyPublished: false } });
      expect(preview.body.reauth.code).toContain("***");

      await o.c.post("/account/privacy/deletion").send({ confirmation: "DELETE" }).expect(401);
      await o.c.post("/account/privacy/deletion").send({ confirmation: "DELETE", code: "000000" }).expect(401);
      await clearOtpCooldown(o.email);
      await o.c.post("/account/privacy/deletion/code").expect(200);
      await o.c.post("/account/privacy/deletion").send({ confirmation: "delete", code: lastOtp(o.email) }).expect(400);
      await clearOtpCooldown(o.email);
      await o.c.post("/account/privacy/deletion/code").expect(200);
      const created = await o.c.post("/account/privacy/deletion").send({ confirmation: "DELETE", code: lastOtp(o.email), reason: "Moving away" }).expect(201);
      expect(created.body.status).toBe("PENDING");
      // The account still works while the request waits; nothing was erased.
      await o.c.get(`/pets/${o.petId}`).expect(200);
      const stranger = await user("b8-stranger");
      await stranger.c.post(`/account/privacy/deletion/${created.body.id}/cancel`).expect(404);
      await o.c.post(`/account/privacy/deletion/${created.body.id}/cancel`).expect(200);
      await o.c.post(`/account/privacy/deletion/${created.body.id}/cancel`).expect(404);

      // The only owner of a shared household is blocked until someone else can run it.
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member)}/accept`).expect(201);
      const blocked = await o.c.get("/account/privacy/deletion/preview").expect(200);
      expect(blocked.body.blockers).toEqual([{ code: "ONLY_OWNER_OF_SHARED_HOUSEHOLD", count: 1 }]);
      await clearOtpCooldown(o.email);
      await o.c.post("/account/privacy/deletion/code").expect(200);
      const refused = await o.c.post("/account/privacy/deletion").send({ confirmation: "DELETE", code: lastOtp(o.email) }).expect(409);
      expect(refused.body.error.code).toBe("DELETION_BLOCKED");
    });
  });


  // ------------------------------------------------------------------ 8E notification preferences

  describe("notification preferences are really honoured", () => {
    it("switching a category off in-app keeps it out of the inbox; marketing needs consent; security can't be silenced", async () => {
      const u = await user("b8-prefs");
      const orchestrator = app.get(NotificationOrchestratorService);
      await u.c.patch("/notification-preferences").send({ preferences: [{ category: "HOUSEHOLD", channel: "IN_APP", enabled: false }, { category: "SECURITY", channel: "IN_APP", enabled: false }] }).expect(200);

      await orchestrator.notify({ userId: u.userId, type: "household.invited", category: "HOUSEHOLD", templateParams: { inviterName: "Sara" } });
      await orchestrator.notify({ userId: u.userId, type: "security.password_changed", category: "SECURITY" });
      await orchestrator.notify({ userId: u.userId, type: "household.invited", category: "MARKETING", templateParams: { inviterName: "Promo" } });

      const inbox = await u.c.get("/notifications?pageSize=50").expect(200);
      const types = inbox.body.items.map((n: { category: string }) => n.category);
      expect(types).toContain("SECURITY");
      expect(types).not.toContain("HOUSEHOLD");
      expect(types).not.toContain("MARKETING");
      const unread = await u.c.get("/notifications/unread-count").expect(200);
      expect(unread.body.unreadCount).toBe(types.length);
      // Still recorded, with the reason.
      const skipped = await prisma.notificationDelivery.findFirstOrThrow({ where: { notification: { userId: u.userId, category: "HOUSEHOLD" }, channel: "IN_APP" } });
      expect(skipped.status).toBe("SKIPPED");

      // With marketing consent, marketing reaches the inbox.
      await u.c.patch("/account/privacy/consent").send({ kind: "MARKETING", granted: true }).expect(200);
      await orchestrator.notify({ userId: u.userId, type: "household.invited", category: "MARKETING", templateParams: { inviterName: "Promo 2" } });
      const after = await u.c.get("/notifications?pageSize=50").expect(200);
      expect(after.body.items.some((n: { category: string }) => n.category === "MARKETING")).toBe(true);
    });
  });


  // ------------------------------------------------------------------ 8F membership

  describe("membership", () => {
    it("only household owners can buy, change or cancel the membership or read its billing; members can still see what they get", async () => {
      const o = await owner();
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member)}/accept`).expect(201);
      const base = `/households/${o.householdId}/subscription`;

      const current = await member.c.get(base).expect(200);
      expect(current.body.billingMode).toBe("SANDBOX");
      await member.c.get(`${base}/entitlements`).expect(200);
      await member.c.get(`${base}/usage`).expect(200);
      for (const [method, path] of [["get", "billing-history"], ["post", "cancel"], ["post", "resume"], ["post", "trial"], ["post", "subscribe"], ["post", "upgrade"], ["post", "downgrade"]] as const) {
        const res = await member.c[method](`${base}/${path}`).send({});
        expect([403]).toContain(res.status);
      }
      const history = await o.c.get(`${base}/billing-history`).expect(200);
      for (const attempt of history.body.attempts) expect(attempt.failureReason).toBeNull();
    });
  });


  // ------------------------------------------------------------------ 8G activity

  describe("account activity", () => {
    it("is the person's own, filterable, paginated, and shows only safe detail", async () => {
      const u = await user("b8-activity");
      await signIn(u.email);
      await u.c.patch("/account/privacy/consent").send({ kind: "MARKETING", granted: true }).expect(200);
      const other = await user("b8-other");
      await other.c.patch("/account/privacy/consent").send({ kind: "MARKETING", granted: true }).expect(200);

      const all = await u.c.get("/account/activity").expect(200);
      expect(all.body.items.length).toBeGreaterThanOrEqual(3);
      expect(all.body.items.filter((i: { type: string }) => i.type === "ConsentChanged")).toHaveLength(1);
      const serialized = JSON.stringify(all.body);
      expect(serialized).not.toContain(other.userId);
      expect(serialized).not.toContain("sessionId");
      expect(all.body.items.find((i: { type: string }) => i.type === "ConsentChanged").detail).toMatchObject({ kind: "MARKETING", granted: true });

      const security = await u.c.get("/account/activity?group=SECURITY").expect(200);
      expect(security.body.items.every((i: { group: string }) => i.group === "SECURITY")).toBe(true);

      const first = await u.c.get("/account/activity?limit=1").expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toBeTruthy();
      const second = await u.c.get(`/account/activity?limit=1&before=${encodeURIComponent(first.body.nextCursor)}`).expect(200);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
      await u.c.get("/account/activity?group=EVERYTHING").expect(400);

      // Membership events belong to the household's owners only.
      const o = await owner();
      const member = await user("b8-member");
      await member.c.post(`/household-invitations/${await invite(o, member)}/accept`).expect(201);
      const plan = await prisma.subscriptionPlan.create({ data: { code: `b8-${unique()}`, nameFa: "آزمایشی", nameEn: "Trial plan", isFree: false, sortOrder: 90, trialDays: 7, countryAvailability: { create: { countryCode: "IR" } } } });
      await prisma.household.update({ where: { id: o.householdId }, data: { countryCode: "IR" } });
      await o.c.post(`/households/${o.householdId}/subscription/trial`).send({ planId: plan.id }).expect(201);
      const ownerView = await o.c.get("/account/activity?group=MEMBERSHIP").expect(200);
      const memberView = await member.c.get("/account/activity?group=MEMBERSHIP").expect(200);
      expect(memberView.body.items).toHaveLength(0);
      expect(ownerView.body.items[0]).toMatchObject({ type: "SubscriptionStarted", group: "MEMBERSHIP", detail: { isTrial: true } });
      expect(JSON.stringify(ownerView.body)).not.toContain(plan.id);
    });
  });

});
