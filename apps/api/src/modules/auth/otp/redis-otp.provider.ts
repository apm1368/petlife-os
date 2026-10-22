import type Redis from "ioredis";
import type { ConfigService } from "@nestjs/config";
import { createHash, randomInt } from "node:crypto";
import { OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import type { OtpProvider, OtpPurpose } from "./otp-provider.interface";

interface OtpRecord {
  codeHash: string;
  attempts: number;
  createdAt: number;
}

/**
 * Code lifecycle shared by every OTP provider: generation, hashing, TTL, resend cooldown and the
 * per-code attempt budget, all in Redis (survives across API instances, never touches Postgres).
 * Subclasses only decide how a fresh code reaches the person.
 */
export abstract class RedisOtpProvider implements OtpProvider {
  protected constructor(
    protected readonly redis: Redis,
    protected readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Hands a freshly issued code to the person. Throwing withdraws the code and the cooldown. */
  protected abstract deliver(identifier: string, code: string, ttlSeconds: number, purpose: OtpPurpose): Promise<void>;

  private codeKey(identifier: string, purpose: OtpPurpose) {
    return `otp:code:${purpose}:${identifier}`;
  }
  private cooldownKey(identifier: string, purpose: OtpPurpose) {
    return `otp:cooldown:${purpose}:${identifier}`;
  }

  async sendOtp(identifier: string, purpose: OtpPurpose = "direct"): Promise<void> {
    const cooldownTtl = await this.redis.ttl(this.cooldownKey(identifier, purpose));
    if (cooldownTtl > 0) {
      throw new OtpRateLimitedException(cooldownTtl);
    }

    const length = this.config.get("OTP_LENGTH", { infer: true });
    const ttlSeconds = this.config.get("OTP_TTL_SECONDS", { infer: true });
    const cooldownSeconds = this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true });

    const code = generateNumericCode(length);
    const record: OtpRecord = { codeHash: hashCode(code), attempts: 0, createdAt: Date.now() };

    await this.redis.set(this.codeKey(identifier, purpose), JSON.stringify(record), "EX", ttlSeconds);
    await this.redis.set(this.cooldownKey(identifier, purpose), "1", "EX", cooldownSeconds);

    try {
      await this.deliver(identifier, code, ttlSeconds, purpose);
    } catch (error) {
      // A code nobody received must not linger, and the person must be able to retry at once.
      await this.redis.del(this.codeKey(identifier, purpose), this.cooldownKey(identifier, purpose));
      throw error;
    }
  }

  async verifyOtp(identifier: string, code: string, purpose: OtpPurpose = "direct"): Promise<void> {
    const key = this.codeKey(identifier, purpose);
    const raw = await this.redis.get(key);
    if (!raw) throw new OtpInvalidException();

    const record: OtpRecord = JSON.parse(raw);
    const maxAttempts = this.config.get("OTP_MAX_ATTEMPTS", { infer: true });

    if (record.attempts >= maxAttempts) {
      await this.redis.del(key);
      throw new OtpInvalidException();
    }

    if (record.codeHash !== hashCode(code)) {
      record.attempts += 1;
      const ttl = await this.redis.ttl(key);
      await this.redis.set(key, JSON.stringify(record), "EX", Math.max(ttl, 1));
      throw new OtpInvalidException();
    }

    // Single use even under concurrent submissions of the same correct code: only the request that actually deletes the record wins.
    const consumed = await this.redis.del(key);
    if (consumed === 0) throw new OtpInvalidException();
  }
}

function generateNumericCode(length: number): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, "0");
}

function hashCode(code: string): string {
  // Codes are short-lived and single-use; a fast hash is enough to avoid
  // storing them in plaintext in Redis.
  return createHash("sha256").update(code).digest("hex");
}
