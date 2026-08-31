import { Inject, Injectable } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { classifyIdentifier } from "./identifier.util";
import { OTP_PROVIDER, type OtpProvider } from "./otp/otp-provider.interface";

@Injectable()
export class AuthService {
  constructor(
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
  ) {}

  async requestOtp(identifier: string): Promise<void> {
    const { value } = classifyIdentifier(identifier);
    await this.otpProvider.sendOtp(value);
  }

  async verifyOtp(
    identifier: string,
    code: string,
    res: Response,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<SessionUser> {
    const { kind, value } = classifyIdentifier(identifier);
    await this.otpProvider.verifyOtp(value, code);

    const user = await this.prisma.user.upsert({
      where: kind === "email" ? { email: value } : { phone: value },
      update: {},
      create: {
        email: kind === "email" ? value : null,
        phone: kind === "phone" ? value : null,
        displayName: kind === "email" ? value.split("@")[0]! : value,
      },
    });

    // Session rotation: always issue a fresh session row on successful auth
    // rather than reusing any pre-existing one.
    await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserAuthenticated", { userId: user.id });

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
