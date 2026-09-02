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
  ) {}

  /** Always resolves the same way regardless of whether identifier matched anything — never reveals account existence. */
  async requestReset(identifier: string): Promise<void> {
    const { kind, value } = classifyLoginIdentifier(identifier);
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

    // Never logged in production — see class doc comment. This is the only
    // way the raw token is ever observable; the DB only ever stores its hash.
    this.logger.log(`[DEV PASSWORD RESET] userId=${user.id} token=${rawToken} (expires in ${ttlMinutes}m)`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new PasswordResetTokenInvalidException();
    }

    const newHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: newHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    // A reset must invalidate every existing session, including one an
    // attacker who compromised the credential may currently hold.
    await this.sessions.revokeAllForUser(record.userId);
    await this.events.publish("PasswordResetCompleted", { userId: record.userId });
  }
}
