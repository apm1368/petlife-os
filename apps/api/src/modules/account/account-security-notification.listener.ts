import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

/**
 * Batch 8 — security notices through the existing orchestrator. SECURITY is
 * a non-suppressible category, so these always reach the in-app inbox. Only
 * moments a person would want to know about: a sign-in on a new session
 * (not their very first), a password change, a contact change, other
 * devices being signed out, and an unproven password being cleared.
 */
@Injectable()
export class AccountSecurityNotificationListener {
  private readonly logger = new Logger(AccountSecurityNotificationListener.name);

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  private async send(userId: string, type: string, domainEventId: string, templateParams: Record<string, string> = {}, priority: NotificationPriority = NotificationPriority.HIGH) {
    try {
      await this.orchestrator.notify({ userId, type, category: NotificationCategory.SECURITY, priority, templateParams, deepLink: NotificationDeepLinks.profileSecurity(), entityType: "User", entityId: userId, domainEventId });
    } catch (error) {
      this.logger.error(`Security notification ${type} failed`, error instanceof Error ? error.stack : undefined);
    }
  }

  @OnEvent("UserAuthenticated")
  async onSignIn(p: { userId: string; sessionId?: string; device?: string | null; firstSignIn?: boolean }, domainEventId: string) {
    if (p.firstSignIn) return;
    // The very first session of an account is not "a new sign-in" worth flagging.
    const earlier = await this.prisma.session.count({ where: { userId: p.userId, ...(p.sessionId ? { id: { not: p.sessionId } } : {}) } });
    if (earlier === 0) return;
    await this.send(p.userId, "security.new_sign_in", domainEventId, { device: p.device ?? "—" }, NotificationPriority.NORMAL);
  }

  @OnEvent("PasswordChanged")
  onPasswordChanged(p: { userId: string }, domainEventId: string) {
    return this.send(p.userId, "security.password_changed", domainEventId);
  }

  @OnEvent("PasswordResetCompleted")
  onPasswordReset(p: { userId: string }, domainEventId: string) {
    return this.send(p.userId, "security.password_changed", domainEventId);
  }

  @OnEvent("ContactChanged")
  async onContactChanged(p: { userId: string; kind: "email" | "phone" }, domainEventId: string) {
    const locale = (await this.prisma.user.findUnique({ where: { id: p.userId }, select: { locale: true } }))?.locale;
    const label = p.kind === "email" ? (locale === "fa" ? "ایمیل" : "email") : locale === "fa" ? "شمارهٔ موبایل" : "mobile number";
    await this.send(p.userId, "security.contact_changed", domainEventId, { contactKind: label });
  }

  @OnEvent("OtherSessionsRevoked")
  async onOthersRevoked(p: { userId: string; count: number }, domainEventId: string) {
    if (p.count > 0) await this.send(p.userId, "security.sessions_revoked", domainEventId, { count: String(p.count) }, NotificationPriority.NORMAL);
  }

  @OnEvent("UnverifiedCredentialsCleared")
  onCleared(p: { userId: string }, domainEventId: string) {
    return this.send(p.userId, "security.unverified_credentials_cleared", domainEventId);
  }
}
