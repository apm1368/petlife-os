import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SessionService } from "../../../common/session/session.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { OtpInvalidException } from "../../../common/errors/api-exception";
import { hashPassword } from "../../../common/password/password-hash.util";
import { normalizeUsername } from "../identifier.util";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";
import { OtpGateService } from "../otp/otp-gate.service";

/**
 * Forgot/reset password by SMS: a code goes to the account's verified mobile and, entered with a new
 * password, replaces the password and ends every session. Neither step reveals whether a username
 * exists or has a mobile on file.
 */
@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger("AuthPasswordResetService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
    private readonly limiter: IdentifierRateLimiter,
    private readonly otp: OtpGateService,
  ) {}

  /** Always resolves the same way regardless of whether the username matched anything — never reveals account existence. */
  async requestReset(identifier: string): Promise<void> {
    const username = normalizeUsername(identifier);
    // Hourly budget per username; when spent the request is accepted and silently dropped, exactly
    // like an unknown username, so neither the limit nor the response reveals an account.
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.passwordForgot;
    if ((await this.limiter.retryAfter(bucket, username, limit)) > 0) return;
    await this.limiter.hit(bucket, username, windowSeconds);
    const user = await this.prisma.user.findUnique({ where: { normalizedUsername: username }, select: { id: true, phone: true, phoneVerifiedAt: true } });
    if (!user?.phone || !user.phoneVerifiedAt) return;

    try {
      await this.otp.send(user.phone, "reset");
    } catch (error) {
      // A send failure or cooldown must look exactly like success to the caller.
      this.logger.warn(`Password reset code not sent for userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    await this.events.publish("PasswordResetRequested", { userId: user.id });
  }

  async resetPassword(identifier: string, code: string, newPassword: string): Promise<void> {
    const username = normalizeUsername(identifier);
    const user = await this.prisma.user.findUnique({ where: { normalizedUsername: username }, select: { id: true, phone: true, phoneVerifiedAt: true } });
    // An unknown username, or one with no mobile, fails exactly like a wrong code.
    if (!user?.phone || !user.phoneVerifiedAt) throw new OtpInvalidException();
    await this.otp.verify(user.phone, code, "reset");

    const newHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    });

    // A reset must invalidate every existing session, including one an
    // attacker who compromised the credential may currently hold.
    await this.sessions.revokeAllForUser(user.id);
    await this.events.publish("PasswordResetCompleted", { userId: user.id }, { aggregateType: "User", aggregateId: user.id });
  }
}
