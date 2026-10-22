import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { OtpDeliveryFailedException, ValidationApiException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import { FarazSmsClient, FarazSmsError } from "../../notifications/messaging/faraz-sms.client";
import type { OtpPurpose } from "./otp-provider.interface";
import { RedisOtpProvider } from "./redis-otp.provider";

/**
 * Sends codes by SMS through a pre-approved FarazSMS pattern (FARAZ_SMS_OTP_PATTERN_CODE) — the
 * unqueued, unmoderated send path FarazSMS recommends for OTP. The pattern's code variable is
 * FARAZ_SMS_OTP_PATTERN_VAR ("code" unless configured otherwise). Phone numbers only.
 */
@Injectable()
export class FarazOtpProvider extends RedisOtpProvider {
  private readonly logger = new Logger("FarazOtpProvider");

  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppEnv, true>,
    private readonly faraz: FarazSmsClient,
  ) {
    super(redis, config);
  }

  protected async deliver(identifier: string, code: string, _ttlSeconds: number, purpose: OtpPurpose): Promise<void> {
    if (identifier.includes("@")) throw new ValidationApiException({ field: "identifier", reason: "Codes can only be sent to a mobile number." });
    const patternCode = this.config.get("FARAZ_SMS_OTP_PATTERN_CODE", { infer: true });
    const variable = this.config.get("FARAZ_SMS_OTP_PATTERN_VAR", { infer: true });
    if (!patternCode) throw new OtpDeliveryFailedException();
    try {
      const requestId = await this.faraz.sendPattern({ code: patternCode, recipient: identifier, attributes: { [variable]: code } });
      this.logger.log(`OTP sent purpose=${purpose} requestId=${requestId}`);
    } catch (error) {
      if (error instanceof FarazSmsError) throw new OtpDeliveryFailedException();
      throw error;
    }
  }
}
