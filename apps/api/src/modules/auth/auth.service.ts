import { Inject, Injectable } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../common/prisma/prisma.service";
import { deviceLabel } from "../../common/session/device-label.util";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { classifyIdentifier } from "./identifier.util";
import { OTP_PROVIDER, type OtpProvider } from "./otp/otp-provider.interface";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../common/rate-limit/identifier-rate-limiter.service";
import { OtpInvalidException, OtpRateLimitedException } from "../../common/errors/api-exception";

import { markContactVerified } from "./contact-verification.util";

@Injectable()
export class AuthService {
  constructor(
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
    private readonly limiter: IdentifierRateLimiter,
  ) {}

  async requestOtp(identifier: string): Promise<void> {
    const { value } = classifyIdentifier(identifier);
    // Hourly budget per number/email on top of the provider's resend cooldown: caps SMS bombing of a
    // victim and the number of fresh codes (and so guesses) an attacker can cycle through.
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpSend;
    const wait = await this.limiter.retryAfter(bucket, value, limit);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    await this.otpProvider.sendOtp(value);
    await this.limiter.hit(bucket, value, windowSeconds);
  }

  async verifyOtp(
    identifier: string,
    code: string,
    res: Response,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<SessionUser> {
    const { kind, value } = classifyIdentifier(identifier);
    // Failed guesses are budgeted per identifier across codes, so resending never restores the budget.
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.otpVerifyFail;
    const wait = await this.limiter.retryAfter(bucket, value, limit);
    if (wait > 0) throw new OtpRateLimitedException(wait);
    try {
      await this.otpProvider.verifyOtp(value, code);
    } catch (error) {
      if (error instanceof OtpInvalidException) await this.limiter.hit(bucket, value, windowSeconds);
      throw error;
    }
    await this.limiter.reset(bucket, value);

    const user = await this.prisma.user.upsert({
      where: kind === "email" ? { email: value } : { phone: value },
      update: {},
      create: {
        email: kind === "email" ? value : null,
        phone: kind === "phone" ? value : null,
        displayName: kind === "email" ? value.split("@")[0]! : value,
      },
    });

    const { clearedUnverifiedCredentials } = await markContactVerified(this.prisma, user, kind === "email" ? "email" : "phone");
    if (clearedUnverifiedCredentials) await this.events.publish("UnverifiedCredentialsCleared", { userId: user.id, via: "OTP" }, { aggregateType: "User", aggregateId: user.id });

    // Session rotation: always issue a fresh session row on successful auth
    // rather than reusing any pre-existing one.
    const sessionId = await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserAuthenticated", { userId: user.id, method: "OTP", sessionId, device: deviceLabel(meta.userAgent) }, { aggregateType: "User", aggregateId: user.id });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      locale: user.locale,
      themePreference: user.themePreference,
    };
  }

  async logout(cookieValue: string | undefined, res: Response): Promise<void> {
    await this.sessions.revokeByCookie(cookieValue, res);
  }
}
