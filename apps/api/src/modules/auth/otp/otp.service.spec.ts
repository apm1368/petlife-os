import { OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import { IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";
import { OtpCodeStore } from "./otp-code-store";
import { OtpService } from "./otp.service";

/** A tiny in-memory Redis with just the commands OtpCodeStore and IdentifierRateLimiter use (strings + hashes + TTL). */
function fakeRedis() {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const ttls = new Map<string, number>();
  const api = {
    async set(key: string, value: string, _ex: string, seconds: number, nx?: string) {
      if (nx === "NX" && (strings.has(key) || hashes.has(key))) return null;
      strings.set(key, value);
      ttls.set(key, seconds);
      return "OK";
    },
    async ttl(key: string) { return strings.has(key) || hashes.has(key) ? ttls.get(key) ?? -1 : -2; },
    async get(key: string) { return strings.get(key) ?? null; },
    async del(...keys: string[]) { let n = 0; for (const k of keys) { if (strings.delete(k) || hashes.delete(k)) n++; ttls.delete(k); } return n; },
    async incr(key: string) { const v = Number(strings.get(key) ?? 0) + 1; strings.set(key, String(v)); return v; },
    multi() {
      const ops: (() => Promise<unknown>)[] = [];
      const chain = {
        set: (k: string, v: string, ex: string, s: number, nx?: string) => (ops.push(() => api.set(k, v, ex, s, nx)), chain),
        incr: (k: string) => (ops.push(() => api.incr(k)), chain),
        del: (k: string) => (ops.push(() => api.del(k)), chain),
        hset: (k: string, v: Record<string, string>) => (ops.push(async () => hashes.set(k, { ...v })), chain),
        expire: (k: string, s: number) => (ops.push(async () => ttls.set(k, s)), chain),
        exec: async () => { const out: [null, unknown][] = []; for (const op of ops) out.push([null, await op()]); return out; },
      };
      return chain;
    },
    // The CHECK_SCRIPT semantics, mirrored for the unit test (the real Lua runs in the e2e suite against Redis).
    async eval(_script: string, _n: number, key: string, hash: string, max: string) {
      const h = hashes.get(key);
      if (!h) return 0;
      const a = Number(h.a) + 1;
      h.a = String(a);
      if (a > Number(max)) { hashes.delete(key); return 0; }
      if (h.h === hash) { hashes.delete(key); return 1; }
      if (a >= Number(max)) hashes.delete(key);
      return -1;
    },
  };
  return api;
}

const configValues: Record<string, unknown> = { OTP_LENGTH: 6, OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 30, OTP_MAX_ATTEMPTS: 5 };

function setup() {
  const redis = fakeRedis();
  const config = { get: (k: string) => configValues[k] } as never;
  const delivered: { identifier: string; code: string; purpose: string }[] = [];
  const provider = { deliver: jest.fn(async (identifier: string, code: string, purpose: string) => { delivered.push({ identifier, code, purpose }); }) };
  const service = new OtpService(provider, new OtpCodeStore(redis as never, config), new IdentifierRateLimiter(redis as never));
  const clearCooldown = (id: string) => redis.del(`otp:cooldown:${id}`);
  return { service, provider, delivered, clearCooldown };
}

const phone = "+989121234567";

describe("OtpService", () => {
  it("issues one code per cooldown, even when requests race", async () => {
    const { service, provider } = setup();
    const results = await Promise.allSettled([service.send(phone), service.send(phone), service.send(phone)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof OtpRateLimitedException)).toHaveLength(2);
    expect(provider.deliver).toHaveBeenCalledTimes(1);
  });

  it("caps sends per number per hour for every purpose together", async () => {
    const { service, clearCooldown } = setup();
    const purposes = ["login", "contact-change", "account-deletion", "login", "contact-change"] as const;
    for (const purpose of purposes) { await clearCooldown(phone); await service.send(phone, { purpose, userId: "u1" }); }
    await clearCooldown(phone);
    await expect(service.send(phone, { purpose: "contact-change", userId: "u1" })).rejects.toBeInstanceOf(OtpRateLimitedException);
  });

  it("gives the cooldown back when delivery fails", async () => {
    const { service, provider } = setup();
    provider.deliver.mockRejectedValueOnce(new Error("provider down"));
    await expect(service.send(phone)).rejects.toThrow("provider down");
    await expect(service.send(phone)).resolves.toBeUndefined();
  });

  it("a code only proves the purpose and account it was issued for, and works once", async () => {
    const { service, delivered } = setup();
    await service.send(phone, { purpose: "contact-change", userId: "u1" });
    const { code } = delivered[0]!;
    await expect(service.verify(phone, code)).rejects.toBeInstanceOf(OtpInvalidException);
    await expect(service.verify(phone, code, { purpose: "contact-change", userId: "u2" })).rejects.toBeInstanceOf(OtpInvalidException);
    await expect(service.verify(phone, code, { purpose: "contact-change", userId: "u1" })).resolves.toBeUndefined();
    await expect(service.verify(phone, code, { purpose: "contact-change", userId: "u1" })).rejects.toBeInstanceOf(OtpInvalidException);
  });

  it("allows at most OTP_MAX_ATTEMPTS guesses per code, even concurrently", async () => {
    const { service, delivered } = setup();
    await service.send(phone);
    const real = delivered[0]!.code;
    const wrong = real === "000000" ? "000001" : "000000";
    await Promise.allSettled(Array.from({ length: 8 }, () => service.verify(phone, wrong)));
    // The code is spent after five wrong guesses: the right code no longer works either.
    await expect(service.verify(phone, real)).rejects.toBeInstanceOf(OtpInvalidException);
  });

  it("does not let strangers lock a number out when no code is outstanding", async () => {
    const { service, delivered } = setup();
    for (let i = 0; i < 25; i++) await expect(service.verify(phone, String(100000 + i))).rejects.toBeInstanceOf(OtpInvalidException);
    await service.send(phone);
    await expect(service.verify(phone, delivered[0]!.code)).resolves.toBeUndefined();
  });

  it("budgets wrong guesses against live codes per number across codes", async () => {
    const { service, delivered, clearCooldown } = setup();
    for (let round = 0; round < 2; round++) {
      await clearCooldown(phone);
      await service.send(phone);
      const real = delivered[delivered.length - 1]!.code;
      const wrong = real === "000000" ? "000001" : "000000";
      for (let i = 0; i < 5; i++) await expect(service.verify(phone, wrong)).rejects.toBeInstanceOf(OtpInvalidException);
    }
    await clearCooldown(phone);
    await service.send(phone);
    await expect(service.verify(phone, delivered[delivered.length - 1]!.code)).rejects.toBeInstanceOf(OtpRateLimitedException);
  });
});
