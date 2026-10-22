import { Inject, Injectable } from "@nestjs/common";
import { OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";
import { OTP_PROVIDER, type OtpProvider, type OtpPurpose } from "./otp-provider.interface";

/**
 * Every auth flow sends and checks codes through here, so the per-number budgets apply the same
 * way to sign-up, sign-in and password reset: an hourly send budget on top of the provider's resend
 * cooldown (caps SMS bombing of a victim and the codes an attacker can cycle through), and a failed-
 * guess budget across codes, so resending never restores it.
 */
@Injectable()
export class OtpGateService {
  constructor(
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    private readonly limiter: IdentifierRateLimiter,
  ) {}

  async send(phone: string, purpose: OtpPurpose): Promise<void> {
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpSend;
    const wait = await this.limiter.retryAfter(bucket, phone, limit);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    await this.otp.sendOtp(phone, purpose);
    await this.limiter.hit(bucket, phone, windowSeconds);
  }

  async verify(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpVerifyFail;
    const wait = await this.limiter.retryAfter(bucket, phone, limit);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    try {
      await this.otp.verifyOtp(phone, code, purpose);
    } catch (error) {
      if (error instanceof OtpInvalidException) await this.limiter.hit(bucket, phone, windowSeconds);
      throw error;
    }
    await this.limiter.reset(bucket, phone);
  }
}
