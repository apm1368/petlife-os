import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import type Redis from "ioredis";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { REDIS_CLIENT } from "../src/common/redis/redis.module";

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

});
