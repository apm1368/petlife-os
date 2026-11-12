import { Inject, Injectable } from "@nestjs/common";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";
import { OtpInvalidException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import { LOGIN_OTP, OtpCodeStore, type OtpScope } from "./otp-code-store";
import { OTP_PROVIDER, type OtpProvider } from "./otp-provider.interface";

/**
 * Every one-time code — sign-in, contact change, account deletion — is issued and checked here, so the same
 * budgets protect each of them: one code per number per cooldown, an hourly send budget per number (SMS
 * bombing, SMS-pumping cost, code cycling) and an hourly failed-guess budget per number across codes.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
    private readonly store: OtpCodeStore,
    private readonly limiter: IdentifierRateLimiter,
  ) {}

  async send(identifier: string, scope: OtpScope = LOGIN_OTP): Promise<void> {
    await this.store.claimCooldown(identifier);
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpSend;
    const wait = await this.limiter.consume(bucket, identifier, limit, windowSeconds);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    const code = this.store.newCode();
    try {
      await this.provider.deliver(identifier, code, scope.purpose);
    } catch (error) {
      await this.store.releaseCooldown(identifier);
      throw error;
    }
    await this.store.save(identifier, scope, code);
  }

  async verify(identifier: string, code: string, scope: OtpScope = LOGIN_OTP): Promise<void> {
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpVerifyFail;
    const wait = await this.limiter.retryAfter(bucket, identifier, limit);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    const result = await this.store.check(identifier, scope, code);
    if (result === "MATCH") {
      await this.limiter.reset(bucket, identifier);
      return;
    }
    // Only a guess against a live code spends the budget: with no code outstanding there is nothing to guess,
    // so a stranger cannot lock a number out just by posting wrong codes for it.
    if (result === "WRONG") await this.limiter.hit(bucket, identifier, windowSeconds);
    throw new OtpInvalidException();
  }
}
