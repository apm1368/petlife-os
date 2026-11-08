import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type Redis from "ioredis";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { REDIS_CLIENT } from "../src/common/redis/redis.module";
import { IDENTIFIER_LIMITS, identifierRateLimitKey } from "../src/common/rate-limit/identifier-rate-limiter.service";

/**
 * One phone number is one account, however it is typed (the web client sends +98…, older clients and people
 * type 0912…, Persian keyboards type ۰۹۱۲…), and one OTP budget. Invitations only reach and can only be accepted
 * through a contact the account has verified.
 */
describe("Phone numbers are canonical E.164 everywhere", () => {
  let app: INestApplication, server: ReturnType<INestApplication["getHttpServer"]>, prisma: PrismaService, redis: Redis;
  let logSpy: jest.SpyInstance;

  // Unique per run: 0912 + 7 random digits.
  const national = () => `912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const persian = (digits: string) => digits.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined); });
  afterEach(() => logSpy.mockRestore());

  async function csrf(): Promise<string> {
    return extractCookie((await request(server).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  }
  async function resetOtpBudget(e164: string) {
    await redis.del(`otp:cooldown:${e164}`, identifierRateLimitKey(IDENTIFIER_LIMITS.otpSend.bucket, e164));
  }
  function lastOtp(e164: string): string {
    const calls = logSpy.mock.calls.filter((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(`identifier=${e164} `));
    return /code=(\d+)/.exec(calls[calls.length - 1]![0] as string)![1]!;
  }
  async function signIn(typed: string, e164: string) {
    await resetOtpBudget(e164);
    const token = await csrf();
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: typed }).expect(200);
    const res = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: typed, code: lastOtp(e164) }).expect(200);
    const cookie = `petlife_session=${extractCookie(res.headers["set-cookie"], "petlife_session")}; petlife_csrf=${token}`;
    const me = await request(server).get("/me").set("Cookie", cookie).expect(200);
    return { id: me.body.id as string, cookie, token };
  }

  it("every spelling of a number signs in to the same account, stored as E.164", async () => {
    const n = national();
    const e164 = `+98${n}`;
    const a = await signIn(`0${n}`, e164);
    const b = await signIn(e164, e164);
    const c = await signIn(persian(`0${n}`), e164);
    const d = await signIn(`0098 ${n.slice(0, 3)} ${n.slice(3)}`, e164);
    expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).phone).toBe(e164);
    expect(await prisma.user.count({ where: { phone: { in: [`0${n}`, n, e164] } } })).toBe(1);
  });

  it("the OTP send budget is per number, not per spelling", async () => {
    const n = national();
    const e164 = `+98${n}`;
    await resetOtpBudget(e164);
    const spellings = [`0${n}`, e164, persian(`0${n}`), `00${e164.slice(1)}`, n];
    for (const typed of spellings.slice(0, IDENTIFIER_LIMITS.otpSend.limit)) {
      await redis.del(`otp:cooldown:${e164}`);
      const token = await csrf();
      await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: typed }).expect(200);
    }
    // Only the shared budget can refuse this one: the E.164 spelling was used once and its resend cooldown is cleared.
    await redis.del(`otp:cooldown:${e164}`);
    const token = await csrf();
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: e164 }).expect(429);
  });

  it.each(["02112345678", "+15555550100", "0912123", "not-a-phone"])("rejects %s instead of storing it as typed", async (typed) => {
    const token = await csrf();
    const res = await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${token}`).set("x-csrf-token", token).send({ identifier: typed }).expect(400);
    expect(res.body.error.details.field).toBe("identifier");
  });

  it("invitations: normalize phone, allow unverified matching accounts to request, and require owner approval", async () => {
    const email = `phone-owner-${Date.now()}@example.com`;
    const owner = await signIn(email, email);
    const as = (who: { cookie: string; token: string }) => ({
      post: (p: string) => request(server).post(p).set("Cookie", who.cookie).set("x-csrf-token", who.token),
    });
    const householdId = (await as(owner).post("/households").send({}).expect(201)).body.id as string;
    const petId = (await as(owner).post(`/households/${householdId}/pets`).send({ name: "Invitee pet", species: "DOG", approximateAgeMonths: 10 }).expect(201)).body.id as string;

    // Verified invitee, invited by a differently formatted spelling of their number.
    const n = national();
    const e164 = `+98${n}`;
    const invitee = await signIn(e164, e164);
    const sent = await as(owner).post(`/households/${householdId}/invitations`).send({ contact: `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`, initialAccess: [{ petId, preset: "VIEW_ONLY" }] }).expect(201);
    expect(sent.body.delivery).toBe("IN_APP");
    expect((await prisma.householdInvitation.findUniqueOrThrow({ where: { id: sent.body.id } })).contact).toBe(e164);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: invitee.id, type: "household.invited" }, orderBy: { createdAt: "desc" } });
    const token = note.deepLink!.split("/invitations/")[1]!;

    // An unverified matching number can request membership but receives no access until the owner approves.
    const verifiedAt = (await prisma.user.findUniqueOrThrow({ where: { id: invitee.id } })).phoneVerifiedAt;
    await prisma.user.update({ where: { id: invitee.id }, data: { phoneVerifiedAt: null } });
    const requestResult = await as(invitee).post(`/household-invitations/${token}/request`).expect(201);
    expect(requestResult.body).toMatchObject({ status: "REQUESTED", alreadyRequested: false });
    expect(await prisma.householdMember.count({ where: { householdId, userId: invitee.id } })).toBe(0);
    await prisma.user.update({ where: { id: invitee.id }, data: { phoneVerifiedAt: verifiedAt } });
    expect((await as(invitee).post(`/household-invitations/${token}/request`).expect(201)).body.alreadyRequested).toBe(true);
    await as(owner).post(`/households/${householdId}/invitations/${requestResult.body.invitationId}/approve`).expect(201);
    expect(await prisma.householdMember.count({ where: { householdId, userId: invitee.id } })).toBe(1);

    // An account that merely typed the matching number may request, but still gets nothing until approval.
    const squatterEmail = `phone-squatter-${Date.now()}@example.com`;
    const squatter = await signIn(squatterEmail, squatterEmail);
    const other = `+98${national()}`;
    await prisma.user.update({ where: { id: squatter.id }, data: { phone: other, phoneVerifiedAt: null } });
    const blocked = await as(owner).post(`/households/${householdId}/invitations`).send({ contact: `0${other.slice(3)}`, initialAccess: [{ petId, preset: "VIEW_ONLY" }] }).expect(201);
    expect(blocked.body.delivery).toBe("IN_APP");
    expect(await prisma.notification.count({ where: { userId: squatter.id, type: "household.invited" } })).toBe(1);
    const squatterNote = await prisma.notification.findFirstOrThrow({ where: { userId: squatter.id, type: "household.invited" }, orderBy: { createdAt: "desc" } });
    const squatterToken = squatterNote.deepLink!.split("/invitations/")[1]!;
    const requested = await as(squatter).post(`/household-invitations/${squatterToken}/request`).expect(201);
    expect(await prisma.householdMember.count({ where: { householdId, userId: squatter.id } })).toBe(0);
    const rejected = await as(owner).post(`/households/${householdId}/invitations/${requested.body.invitationId}/reject`).expect(201);
    expect(rejected.body).toMatchObject({ ok: true });
    expect(await prisma.householdMember.count({ where: { householdId, userId: squatter.id } })).toBe(0);
  });

  it("an invitation created before signup matches the later unverified phone account and still needs owner approval", async () => {
    const ownerEmail = `later-invite-owner-${Date.now()}@example.com`;
    const owner = await signIn(ownerEmail, ownerEmail);
    const asOwner = (path: string) => request(server).post(path).set("Cookie", owner.cookie).set("x-csrf-token", owner.token);
    const householdId = (await asOwner("/households").send({}).expect(201)).body.id as string;
    const petId = (await asOwner(`/households/${householdId}/pets`).send({ name: "Private after signup", species: "CAT", approximateAgeMonths: 8 }).expect(201)).body.id as string;
    const phone = `+98${national()}`;
    const invitation = await asOwner(`/households/${householdId}/invitations`).send({
      contact: phone,
      initialAccess: [{ petId, preset: "VIEW_ONLY" }],
    }).expect(201);
    expect(invitation.body.delivery).toBe("LINK_ONLY");
    const tokenFromShareLink = invitation.body.sharePath.split("/invitations/")[1] as string;

    const csrfToken = await csrf();
    const username = `family${national().slice(-7)}`;
    const registration = await request(server).post("/auth/register")
      .set("Cookie", `petlife_csrf=${csrfToken}`)
      .set("x-csrf-token", csrfToken)
      .send({ username, password: "family-password-123", firstName: "New", lastName: "Member", phone })
      .expect(200);
    expect(registration.body.user).toMatchObject({ phone });
    const cookie = `petlife_session=${extractCookie(registration.headers["set-cookie"], "petlife_session")}; petlife_csrf=${csrfToken}`;
    const registeredUserId = registration.body.user.id as string;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } })).phoneVerifiedAt).toBeNull();
    const registered = {
      get: (path: string) => request(server).get(path).set("Cookie", cookie),
      post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", csrfToken),
    };

    const inspection = await registered.get(`/household-invitations/${tokenFromShareLink}`).expect(200);
    expect(inspection.body).toMatchObject({ phoneVerified: false, requestPending: false });
    expect(inspection.body).not.toHaveProperty("household");
    await registered.get(`/households/${householdId}`).expect(403);
    const membershipRequest = await registered.post(`/household-invitations/${tokenFromShareLink}/request`).expect(201);
    expect(membershipRequest.body).toMatchObject({ status: "REQUESTED", alreadyRequested: false });
    expect(await prisma.householdMember.count({ where: { householdId, userId: registeredUserId } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } })).phoneVerifiedAt).toBeNull();

    await asOwner(`/households/${householdId}/invitations/${membershipRequest.body.invitationId}/approve`).expect(201);
    expect(await prisma.householdMember.count({ where: { householdId, userId: registeredUserId } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } })).phoneVerifiedAt).toBeNull();
  });
});
