import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import type { AppEnv } from "../../../config/env";
import type { OtpPurpose } from "./otp-provider.interface";
import { RedisOtpProvider } from "./redis-otp.provider";

/**
 * Development-only OTP provider: prints the code to the server log instead
 * of sending an SMS. Code state lives in Redis (see RedisOtpProvider).
 */
@Injectable()
export class DevOtpProvider extends RedisOtpProvider {
  private readonly logger = new Logger("DevOtpProvider");

  constructor(@Inject(REDIS_CLIENT) redis: Redis, config: ConfigService<AppEnv, true>) {
    super(redis, config);
  }

  protected async deliver(identifier: string, code: string, ttlSeconds: number, purpose: OtpPurpose): Promise<void> {
    // The code itself must never reach a production log stream — this provider has no real
    // SMS delivery and exists for local/test use only. Gate the actual code behind a
    // runtime check rather than trusting call sites to never invoke this provider in prod.
    if (this.config.get("NODE_ENV", { infer: true }) === "production") {
      this.logger.warn(`[DEV OTP] insecure development OTP provider was invoked in production for identifier=${identifier} — no code was logged, and no code was delivered to the user. Configure a real OtpProvider before accepting production traffic.`);
      return;
    }
    this.logger.log(`[DEV OTP] identifier=${identifier} purpose=${purpose} code=${code} (expires in ${ttlSeconds}s)`);
  }
}
