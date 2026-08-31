import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { createHash, randomInt } from "node:crypto";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import type { OtpProvider } from "./otp-provider.interface";

interface OtpRecord {
  codeHash: string;
  attempts: number;
  createdAt: number;
}

/**
 * Development-only OTP provider: prints the code to the server log instead
 * of sending an SMS/email. State (code hash, attempts, cooldown) lives in
 * Redis so it survives across API instances but never touches Postgres.
 */
@Injectable()
export class DevOtpProvider implements OtpProvider {
  private readonly logger = new Logger("DevOtpProvider");

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private codeKey(identifier: string) {
    return `otp:code:${identifier}`;
  }
  private cooldownKey(identifier: string) {
    return `otp:cooldown:${identifier}`;
  }

  async sendOtp(identifier: string): Promise<void> {
    const cooldownTtl = await this.redis.ttl(this.cooldownKey(identifier));
    if (cooldownTtl > 0) {
      throw new OtpRateLimitedException(cooldownTtl);
    }

    const length = this.config.get("OTP_LENGTH", { infer: true });
    const ttlSeconds = this.config.get("OTP_TTL_SECONDS", { infer: true });
    const cooldownSeconds = this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true });

    const code = generateNumericCode(length);
    const record: OtpRecord = { codeHash: hashCode(code), attempts: 0, createdAt: Date.now() };

    await this.redis.set(this.codeKey(identifier), JSON.stringify(record), "EX", ttlSeconds);
    await this.redis.set(this.cooldownKey(identifier), "1", "EX", cooldownSeconds);

    // Never log the code in a non-dev environment; this provider must not be used in production.
    this.logger.log(`[DEV OTP] identifier=${identifier} code=${code} (expires in ${ttlSeconds}s)`);
  }

  async verifyOtp(identifier: string, code: string): Promise<void> {
    const raw = await this.redis.get(this.codeKey(identifier));
    if (!raw) throw new OtpInvalidException();

    const record: OtpRecord = JSON.parse(raw);
    const maxAttempts = this.config.get("OTP_MAX_ATTEMPTS", { infer: true });

    if (record.attempts >= maxAttempts) {
      await this.redis.del(this.codeKey(identifier));
      throw new OtpInvalidException();
    }

    if (record.codeHash !== hashCode(code)) {
      record.attempts += 1;
      const ttl = await this.redis.ttl(this.codeKey(identifier));
      await this.redis.set(this.codeKey(identifier), JSON.stringify(record), "EX", Math.max(ttl, 1));
      throw new OtpInvalidException();
    }

    await this.redis.del(this.codeKey(identifier));
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
