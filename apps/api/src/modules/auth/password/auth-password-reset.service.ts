import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SessionService } from "../../../common/session/session.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { PasswordResetTokenInvalidException } from "../../../common/errors/api-exception";
import { hashPassword } from "../../../common/password/password-hash.util";
import { classifyLoginIdentifier } from "../identifier.util";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Forgot/reset password. There is no transactional-email infrastructure in
 * this codebase (OTP delivery is its own Redis-backed provider, not a
 * general mailer), so — mirroring exactly how DevOtpProvider handles a
 * missing production SMS/email vendor — the reset link is logged to the
 * server console in development rather than actually sent. A production
 * deployment needs a real mail provider wired in here before launch, same
 * TODO as DevOtpProvider's own doc comment.
 */
@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger("AuthPasswordResetService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly limiter: IdentifierRateLimiter,
  ) {}

  /** Always resolves the same way regardless of whether identifier matched anything — never reveals account existence. */
  async requestReset(identifier: string): Promise<void> {
    const { kind, value } = classifyLoginIdentifier(identifier);
    // Hourly budget per identifier; when spent the request is accepted and silently dropped, exactly
    // like an unknown identifier, so neither the limit nor the response reveals an account.
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.passwordForgot;
    if ((await this.limiter.retryAfter(bucket, value, limit)) > 0) return;
    await this.limiter.hit(bucket, value, windowSeconds);
    const user = await this.prisma.user.findUnique({
      where: kind === "email" ? { email: value } : { normalizedUsername: value },
    });
    if (!user) return;

    const rawToken = randomBytes(32).toString("base64url");
    const ttlMinutes = this.config.get("PASSWORD_RESET_TOKEN_TTL_MINUTES", { infer: true });

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });

    await this.events.publish("PasswordResetRequested", { userId: user.id });

    // The raw token must never reach a production log stream — the DB only ever
    // stores its hash, and there is no real mail provider wired in yet (see class
    // doc comment). Gate the actual token behind a runtime check rather than
    // trusting call sites to never invoke this path in production.
    if (this.config.get("NODE_ENV", { infer: true }) === "production") {
      this.logger.warn(`[DEV PASSWORD RESET] insecure development reset-token delivery was invoked in production for userId=${user.id} — no token was logged, and no email was sent. Configure a real mail provider before accepting production traffic.`);
      return;
    }
    this.logger.log(`[DEV PASSWORD RESET] userId=${user.id} token=${rawToken} (expires in ${ttlMinutes}m)`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new PasswordResetTokenInvalidException();
    }

    const newHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Claim the token atomically so two concurrent submissions can't both reset the password.
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count === 0) throw new PasswordResetTokenInvalidException();
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash: newHash } });
      // Any other outstanding reset link for this account dies with this one.
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } });
    });

    // A reset must invalidate every existing session, including one an
    // attacker who compromised the credential may currently hold.
    await this.sessions.revokeAllForUser(record.userId);
    await this.events.publish("PasswordResetCompleted", { userId: record.userId }, { aggregateType: "User", aggregateId: record.userId });
  }
}
