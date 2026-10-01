import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { createHash } from "node:crypto";
import { REDIS_CLIENT } from "../redis/redis.module";

/**
 * Per-identifier limits (a phone, an email, a username) that complement the per-IP ThrottlerGuard:
 * an attacker spreading guesses over many addresses still hits the identifier's budget, and a victim's
 * number cannot be SMS-bombed from a botnet. Fixed windows in Redis; the identifier is hashed so raw
 * contact details never become Redis key names. Callers apply a limit to any identifier string —
 * existing account or not — so the response never reveals whether an account exists.
 */
@Injectable()
export class IdentifierRateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(bucket: string, identifier: string): string {
    return identifierRateLimitKey(bucket, identifier);
  }

  /** Seconds until the window resets when `bucket` is exhausted for `identifier`, otherwise 0. */
  async retryAfter(bucket: string, identifier: string, limit: number): Promise<number> {
    const key = this.key(bucket, identifier);
    const count = Number((await this.redis.get(key)) ?? 0);
    if (count < limit) return 0;
    return Math.max(await this.redis.ttl(key), 1);
  }

  /** Records one event (a send, a failure) in the identifier's window. */
  async hit(bucket: string, identifier: string, windowSeconds: number): Promise<void> {
    const key = this.key(bucket, identifier);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
  }

  /** A successful sign-in clears the failure budget for that identifier. */
  async reset(bucket: string, identifier: string): Promise<void> {
    await this.redis.del(this.key(bucket, identifier));
  }
}

/** Redis key for an identifier's window (exported so tests that legitimately reuse an identifier can clear it). */
export function identifierRateLimitKey(bucket: string, identifier: string): string {
  return `rl:${bucket}:${createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

/** Budgets — generous for a person who mistypes, tight for automation. */
export const IDENTIFIER_LIMITS = {
  otpSend: { bucket: "otp-send", limit: 5, windowSeconds: 3600 },
  otpVerifyFail: { bucket: "otp-verify-fail", limit: 10, windowSeconds: 3600 },
  passwordFail: { bucket: "password-fail", limit: 10, windowSeconds: 900 },
  passwordForgot: { bucket: "password-forgot", limit: 3, windowSeconds: 3600 },
} as const;
