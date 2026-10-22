import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { createHash, randomInt } from "node:crypto";
import { FarazSmsClient } from "../../../common/faraz/faraz-sms.client";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { MessagingSendFailedException, OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import type { OtpProvider } from "./otp-provider.interface";

interface OtpRecord { codeHash: string; attempts: number; createdAt: number }

@Injectable()
export class FarazOtpProvider implements OtpProvider {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly faraz: FarazSmsClient,
  ) {}

  private codeKey(identifier: string) { return `otp:code:${identifier}`; }
  private cooldownKey(identifier: string) { return `otp:cooldown:${identifier}`; }

  async sendOtp(identifier: string): Promise<void> {
    const cooldownTtl = await this.redis.ttl(this.cooldownKey(identifier));
    if (cooldownTtl > 0) throw new OtpRateLimitedException(cooldownTtl);
    if (!/^\+989\d{9}$/.test(identifier)) throw new MessagingSendFailedException({ reason: "SMS_OTP_REQUIRES_PHONE" });

    const length = this.config.get("OTP_LENGTH", { infer: true });
    const ttlSeconds = this.config.get("OTP_TTL_SECONDS", { infer: true });
    const cooldownSeconds = this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true });
    const code = randomInt(0, 10 ** length).toString().padStart(length, "0");
    const result = await this.faraz.sendPattern({
      patternCode: this.config.get("FARAZ_SMS_OTP_PATTERN_CODE", { infer: true })!,
      recipient: identifier,
      attributes: { [this.config.get("FARAZ_SMS_OTP_CODE_ATTRIBUTE", { infer: true })]: code },
    });
    if (!result.ok) {
      if (result.code === "PROVIDER_HTTP_429") throw new OtpRateLimitedException(cooldownSeconds);
      throw new MessagingSendFailedException({ provider: "FARAZ", reason: result.code, failureKind: result.kind });
    }

    const record: OtpRecord = { codeHash: createHash("sha256").update(code).digest("hex"), attempts: 0, createdAt: Date.now() };
    const transaction = this.redis.multi();
    transaction.set(this.codeKey(identifier), JSON.stringify(record), "EX", ttlSeconds);
    transaction.set(this.cooldownKey(identifier), "1", "EX", cooldownSeconds);
    await transaction.exec();
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
    if (record.codeHash !== createHash("sha256").update(code).digest("hex")) {
      record.attempts += 1;
      const ttl = await this.redis.ttl(this.codeKey(identifier));
      await this.redis.set(this.codeKey(identifier), JSON.stringify(record), "EX", Math.max(ttl, 1));
      throw new OtpInvalidException();
    }
    const consumed = await this.redis.del(this.codeKey(identifier));
    if (consumed === 0) throw new OtpInvalidException();
  }
}
