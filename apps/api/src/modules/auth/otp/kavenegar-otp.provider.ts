import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KavenegarSmsClient, type KavenegarSendResult } from "../../../common/kavenegar/kavenegar-sms.client";
import { MessagingSendFailedException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import type { OtpProvider } from "./otp-provider.interface";

/**
 * The one plain-text sign-in SMS, used when no Verify template is configured (standard Kavenegar plan).
 * No URL or domain on purpose: some lines refuse links (Kavenegar 420).
 */
export const KAVENEGAR_OTP_MESSAGE = (code: string): string => `کد تأیید اپت لایف: ${code}\nاین کد را به کسی ندهید.`;

/**
 * Sends one-time codes by SMS through Kavenegar. With KAVENEGAR_OTP_TEMPLATE it uses Verify Lookup (an approved
 * template with %token, advanced service); without it, a plain-text SMS from KAVENEGAR_SENDER. Holds no OTP state.
 */
@Injectable()
export class KavenegarOtpProvider implements OtpProvider {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly kavenegar: KavenegarSmsClient,
  ) {}

  async deliver(identifier: string, code: string): Promise<void> {
    if (!/^\+989\d{9}$/.test(identifier)) throw new MessagingSendFailedException({ reason: "SMS_OTP_REQUIRES_PHONE" });
    const template = this.config.get("KAVENEGAR_OTP_TEMPLATE", { infer: true });
    const result: KavenegarSendResult = template
      ? await this.kavenegar.verifyLookup({ receptor: identifier, template, token: code })
      : await this.kavenegar.send({ receptor: identifier, message: KAVENEGAR_OTP_MESSAGE(code) });
    if (result.ok) return;
    // 451 is Kavenegar's own "too many calls" answer; surface it like our cooldown instead of a gateway error.
    if (result.code === "KAVENEGAR_451") {
      throw new OtpRateLimitedException(this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true }));
    }
    throw new MessagingSendFailedException({ provider: "KAVENEGAR", reason: result.code, failureKind: result.kind });
  }
}
