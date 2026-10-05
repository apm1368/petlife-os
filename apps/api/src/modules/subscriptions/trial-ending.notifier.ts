import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { NotificationCategory, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

const WINDOW_MS = 2 * 86400e3;
const uuidFrom = (seed: string) => {
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};

/**
 * "Your trial ends in N days" — once per trial, to every household member, when the trial has 2 days or less
 * left. The domain event id is derived from (subscription, trialEndsAt), so repeated ticks or concurrent workers
 * converge on one notification per member (Notification's unique domainEventId/type/user).
 */
@Injectable()
export class TrialEndingNotifier implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(TrialEndingNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.process().catch((e) => this.logger.error("Trial-ending tick failed", e)), 3600e3);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process(now = new Date()): Promise<number> {
    const subs = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.TRIALING, trialEndsAt: { gt: now, lte: new Date(now.getTime() + WINDOW_MS) } },
      select: { id: true, householdId: true, trialEndsAt: true, plan: { select: { nameFa: true, nameEn: true } } },
      take: 200,
    });
    let notified = 0;
    for (const s of subs) {
      const eventId = uuidFrom(`trial-ending:${s.id}:${s.trialEndsAt!.toISOString()}`);
      await this.prisma.domainEvent.upsert({ where: { id: eventId }, create: { id: eventId, type: "SubscriptionTrialEndingSoon", aggregateType: "Subscription", aggregateId: s.id, payload: { householdId: s.householdId, trialEndsAt: s.trialEndsAt!.toISOString() } }, update: {} });
      const days = Math.max(1, Math.ceil((s.trialEndsAt!.getTime() - now.getTime()) / 86400e3));
      const members = await this.prisma.householdMember.findMany({ where: { householdId: s.householdId }, select: { userId: true, user: { select: { locale: true } } } });
      for (const m of members) {
        const r = await this.notifications.notify({ userId: m.userId, type: "subscription.trial_ending", category: NotificationCategory.SUBSCRIPTION, householdId: s.householdId, entityType: "Subscription", entityId: s.id, domainEventId: eventId, deepLink: NotificationDeepLinks.membership(), templateParams: { planName: m.user.locale === "en" ? s.plan.nameEn : s.plan.nameFa, days: String(days) } });
        if (r.created) notified++;
      }
    }
    return notified;
  }
}
