import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FarazSmsClient } from "../../../common/faraz/faraz-sms.client";
import { MessagingSendFailedException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import type { OtpProvider } from "./otp-provider.interface";

/** Sends one-time codes by SMS through Faraz's approved OTP pattern. Holds no OTP state (see OtpCodeStore). */
@Injectable()
export class FarazOtpProvider implements OtpProvider {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly faraz: FarazSmsClient,
  ) {}

  async deliver(identifier: string, code: string): Promise<void> {
    if (!/^\+989\d{9}$/.test(identifier)) throw new MessagingSendFailedException({ reason: "SMS_OTP_REQUIRES_PHONE" });
    const result = await this.faraz.sendPattern({
      patternCode: this.config.get("FARAZ_SMS_OTP_PATTERN_CODE", { infer: true })!,
      recipient: identifier,
      attributes: { [this.config.get("FARAZ_SMS_OTP_CODE_ATTRIBUTE", { infer: true })]: code },
    });
    if (result.ok) return;
    if (result.code === "PROVIDER_HTTP_429") throw new OtpRateLimitedException(this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true }));
    throw new MessagingSendFailedException({ provider: "FARAZ", reason: result.code, failureKind: result.kind });
  }
}
