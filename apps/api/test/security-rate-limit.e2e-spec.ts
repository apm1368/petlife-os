import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type Redis from "ioredis";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { REDIS_CLIENT } from "../src/common/redis/redis.module";
import { applyTrustProxy } from "../src/common/http/trust-proxy.util";

/**
 * Security finding G — effective rate limits. The general e2e suite skips the IP throttler; this spec
 * opts in and runs the API exactly as deployed: behind a loopback proxy (TRUST_PROXY default), with
 * X-Forwarded-For carrying the client address the way nginx sends it.
 */
describe("Security: rate limiting (finding G)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let csrf: string;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let ipSeq = 0;
  /** A fresh client address per call — keeps the per-IP throttler out of identifier-budget tests. */
  const nextIp = () => `198.51.${Math.floor(++ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`;
  const phone = (n: number) => `0912${String(Number(run.slice(-5)) * 10 + n).padStart(7, "0").slice(-7)}`;

  beforeAll(async () => {
    process.env.PETLIFE_TEST_THROTTLE = "1";
    app = await createTestApp();
    applyTrustProxy(app as NestExpressApplication, "loopback");
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    const primed = await request(app.getHttpServer()).get("/health/live");
    csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
  });

  afterAll(async () => {
    delete process.env.PETLIFE_TEST_THROTTLE;
    await app.close();
  });

  const post = (url: string, ip: string, body: object) =>
    request(app.getHttpServer()).post(url).set("X-Forwarded-For", ip).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send(body);

  it("keys the IP throttler on the real client behind the proxy, not on the proxy itself", async () => {
    const attacker = "203.0.113.10";
    for (let i = 0; i < 5; i++) await post("/auth/request-otp", attacker, { identifier: phone(10 + i) }).expect(200);
    const blocked = await post("/auth/request-otp", attacker, { identifier: phone(20) });
    expect(blocked.status).toBe(429);
    // Before the fix every client was "127.0.0.1" and shared that exhausted bucket.
    await post("/auth/request-otp", "203.0.113.11", { identifier: phone(21) }).expect(200);
  });

  it("caps OTP sends per phone number across addresses (SMS bombing / code cycling)", async () => {
    const victim = phone(30);
    for (let i = 0; i < 5; i++) {
      await redis.del(`otp:cooldown:${victim}`); // the provider's 30s resend cooldown, elapsed
      await post("/auth/request-otp", nextIp(), { identifier: victim }).expect(200);
    }
    await redis.del(`otp:cooldown:${victim}`);
    const sixth = await post("/auth/request-otp", nextIp(), { identifier: victim });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("OTP_RATE_LIMITED");
  });

  it("budgets failed OTP guesses per phone across codes, so resending never restores guesses", async () => {
    const target = phone(40);
    await post("/auth/request-otp", nextIp(), { identifier: target }).expect(200);
    for (let i = 0; i < 10; i++) {
      const guess = await post("/auth/verify-otp", nextIp(), { identifier: target, code: String(100000 + i) });
      expect(guess.status).toBeGreaterThanOrEqual(400);
      expect(guess.status).not.toBe(429);
    }
    const locked = await post("/auth/verify-otp", nextIp(), { identifier: target, code: "999999" });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("OTP_RATE_LIMITED");
  });

  it("budgets failed password logins per username — identically for names that do not exist", async () => {
    const username = `rl_owner_${run}`;
    const password = `correct-horse-${run}`;
    await post("/auth/register", nextIp(), { username, password }).expect(200);

    for (let i = 0; i < 10; i++) await post("/auth/login/password", nextIp(), { username, password: `wrong-${i}-guess` }).expect(401);
    const real = await post("/auth/login/password", nextIp(), { username, password });
    expect(real.status).toBe(429);
    expect(real.body.error.code).toBe("AUTH_RATE_LIMITED");

    const ghost = `rl_ghost_${run}`;
    for (let i = 0; i < 10; i++) await post("/auth/login/password", nextIp(), { username: ghost, password: `wrong-${i}-guess` }).expect(401);
    const fake = await post("/auth/login/password", nextIp(), { username: ghost, password: "anything-at-all" });
    // Same status and code as a real account: the limit reveals nothing about which usernames exist.
    expect(fake.status).toBe(real.status);
    expect(fake.body.error.code).toBe(real.body.error.code);
  });

  it("a successful sign-in clears the username's failure budget", async () => {
    const username = `rl_recover_${run}`;
    const password = `correct-horse-${run}`;
    await post("/auth/register", nextIp(), { username, password }).expect(200);
    for (let i = 0; i < 9; i++) await post("/auth/login/password", nextIp(), { username, password: `typo-${i}-guess` }).expect(401);
    await post("/auth/login/password", nextIp(), { username, password }).expect(200);
    for (let i = 0; i < 9; i++) await post("/auth/login/password", nextIp(), { username, password: `typo-again-${i}` }).expect(401);
    await post("/auth/login/password", nextIp(), { username, password }).expect(200);
  });

  it("caps password-reset requests per identifier while answering exactly as for an unknown account", async () => {
    const username = `rl_reset_${run}`;
    await post("/auth/register", nextIp(), { username, password: `correct-horse-${run}` }).expect(200);
    for (let i = 0; i < 5; i++) {
      const res = await post("/auth/password/forgot", nextIp(), { identifier: username });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
    const user = await prisma.user.findFirstOrThrow({ where: { username } });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(3);
  });
});
