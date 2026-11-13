import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { createHash, randomInt } from "node:crypto";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";

/**
 * What a code is for. A code only ever proves the purpose (and, for signed-in flows, the account) it was issued
 * for: a sign-in code cannot confirm a contact change or an account deletion, and the reverse.
 */
export type OtpPurpose = "login" | "contact-change" | "account-deletion";
export interface OtpScope {
  purpose: OtpPurpose;
  /** The signed-in account a contact-change or deletion code belongs to. */
  userId?: string;
}
export const LOGIN_OTP: OtpScope = { purpose: "login" };

/** Outcome of checking a code: a match, a wrong guess against a live code, or no live code at all. */
export type OtpCheck = "MATCH" | "WRONG" | "NO_CODE";

/**
 * Checks a guess and spends it in one atomic step, so concurrent submissions can neither exceed the per-code
 * attempt cap nor both consume the same correct code. Returns 1 (match, code deleted), -1 (wrong guess against a
 * live code; the code is deleted once its last allowed guess is used) or 0 (no live code, or already spent).
 */
const CHECK_SCRIPT = `
local h = redis.call('HGET', KEYS[1], 'h')
if not h then return 0 end
local max = tonumber(ARGV[2])
local a = redis.call('HINCRBY', KEYS[1], 'a', 1)
if a > max then redis.call('DEL', KEYS[1]) return 0 end
if h == ARGV[1] then redis.call('DEL', KEYS[1]) return 1 end
if a >= max then redis.call('DEL', KEYS[1]) end
return -1
`;

/**
 * The one place OTP state lives (Redis; never Postgres): the per-number resend cooldown, the hashed code and its
 * attempt counter. Delivery providers only deliver a code they are handed — they keep no state of their own.
 */
@Injectable()
export class OtpCodeStore {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Shared by every purpose: an SMS costs the same whatever it is for, and the recipient is the same person. */
  cooldownKey(identifier: string): string {
    return `otp:cooldown:${identifier}`;
  }

  codeKey(identifier: string, scope: OtpScope): string {
    return `otp:v2:${scope.purpose}:${scope.userId ?? "-"}:${identifier}`;
  }

  newCode(): string {
    const length = this.config.get("OTP_LENGTH", { infer: true });
    return randomInt(0, 10 ** length).toString().padStart(length, "0");
  }

  /** Claims the resend cooldown before anything is sent (SET NX), so concurrent requests cannot each send a code. */
  async claimCooldown(identifier: string): Promise<void> {
    const seconds = this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true });
    const claimed = await this.redis.set(this.cooldownKey(identifier), "1", "EX", seconds, "NX");
    if (claimed === "OK") return;
    throw new OtpRateLimitedException(Math.max(await this.redis.ttl(this.cooldownKey(identifier)), 1));
  }

  /** Gives the cooldown back when nothing was delivered, so the person can retry at once. */
  async releaseCooldown(identifier: string): Promise<void> {
    await this.redis.del(this.cooldownKey(identifier));
  }

  /** Stores only a hash of a delivered code; a new code replaces any earlier one for the same purpose. */
  async save(identifier: string, scope: OtpScope, code: string): Promise<void> {
    const key = this.codeKey(identifier, scope);
    const ttl = this.config.get("OTP_TTL_SECONDS", { infer: true });
    await this.redis.multi().del(key).hset(key, { h: hashCode(code), a: "0" }).expire(key, ttl).exec();
  }

  async check(identifier: string, scope: OtpScope, code: string): Promise<OtpCheck> {
    const max = this.config.get("OTP_MAX_ATTEMPTS", { infer: true });
    const result = Number(await this.redis.eval(CHECK_SCRIPT, 1, this.codeKey(identifier, scope), hashCode(code), String(max)));
    return result === 1 ? "MATCH" : result === -1 ? "WRONG" : "NO_CODE";
  }
}

/** Codes are short-lived, single-use and attempt-capped; a fast hash is enough to keep them out of Redis in plaintext. */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
