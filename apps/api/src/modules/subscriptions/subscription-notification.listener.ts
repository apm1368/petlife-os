import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

interface PlanChangedPayload {
  subscriptionId: string;
  householdId: string;
  planId?: string;
  toPlanId?: string;
  fromPlanId?: string;
  isTrial?: boolean;
  stage?: string;
  recovered?: boolean;
  effectiveAt?: string;
}

/**
 * Subscription lifecycle notifications, routed through H10's
 * NotificationOrchestrator only (spec: "reuse NotificationOrchestrator...
 * respect preferences/quiet hours" — the orchestrator itself, not this
 * listener, is what checks those). A subscription belongs to the household,
 * not one user (see Subscription's own schema doc comment), so every event
 * here fans out to *every* current HouseholdMember — safe to do because
 * Notification's own `@@unique([domainEventId, type, userId])` constraint
 * means a retried/duplicate event delivery still converges to exactly one
 * notification per member, never a duplicate. Each member gets the plan
 * name in their own locale rather than a single hardcoded language, mirroring
 * next-intl's own fa/en split elsewhere in this codebase.
 *
 * Deliberately NOT implemented: `subscription.trial_ending` /
 * `subscription.renewal_upcoming` (both in the spec's "potential events"
 * list) — `SubscriptionRenewalWorkerService` only acts once a period's
 * `endAt` has actually passed, never proactively N days ahead (see that
 * worker's own doc comment), so there is no proactive point in time to fire
 * either "ending soon" notification without adding new proactive-scheduling
 * infrastructure the current renewal design doesn't have. Documented as a
 * known limitation rather than invented for its own sake.
 */
@Injectable()
export class SubscriptionNotificationListener {
  private readonly logger = new Logger(SubscriptionNotificationListener.name);

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async planNames(planId: string | undefined): Promise<{ fa: string; en: string }> {
    if (!planId) return { fa: "", en: "" };
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId }, select: { nameFa: true, nameEn: true } });
    return { fa: plan?.nameFa ?? "", en: plan?.nameEn ?? "" };
  }

  private async notifyHousehold(householdId: string, type: string, planName: { fa: string; en: string }, subscriptionId: string, domainEventId: string): Promise<void> {
    const members = await this.prisma.householdMember.findMany({ where: { householdId }, select: { userId: true, user: { select: { locale: true } } } });
    await Promise.all(
      members.map((member) =>
        this.orchestrator.notify({
          userId: member.userId,
          type,
          category: NotificationCategory.SUBSCRIPTION,
          templateParams: { planName: member.user.locale === "fa" ? planName.fa : planName.en },
          householdId,
          entityType: "Subscription",
          entityId: subscriptionId,
          domainEventId,
        }),
      ),
    );
  }

  @OnEvent("SubscriptionStarted")
  onStarted(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionStarted", async () => {
      const planName = await this.planNames(payload.planId);
      await this.notifyHousehold(payload.householdId, payload.isTrial ? "subscription.trial_started" : "subscription.started", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionUpgraded")
  onUpgraded(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionUpgraded", async () => {
      const planName = await this.planNames(payload.planId);
      await this.notifyHousehold(payload.householdId, "subscription.upgraded", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionRenewed")
  onRenewed(payload: PlanChangedPayload & { householdId: string }, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionRenewed", async () => {
      const sub = await this.prisma.subscription.findUnique({ where: { id: payload.subscriptionId }, select: { planId: true } });
      const planName = await this.planNames(sub?.planId);
      await this.notifyHousehold(payload.householdId, "subscription.renewed", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionRenewalFailed")
  onRenewalFailed(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionRenewalFailed", async () => {
      const sub = await this.prisma.subscription.findUnique({ where: { id: payload.subscriptionId }, select: { planId: true } });
      const planName = await this.planNames(sub?.planId);
      await this.notifyHousehold(payload.householdId, "subscription.renewal_failed", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionGraceStarted")
  onGraceStarted(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionGraceStarted", async () => {
      const sub = await this.prisma.subscription.findUnique({ where: { id: payload.subscriptionId }, select: { planId: true } });
      const planName = await this.planNames(sub?.planId);
      await this.notifyHousehold(payload.householdId, "subscription.grace_started", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionExpired")
  onExpired(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionExpired", async () => {
      // The subscription has already fallen back to FREE by the time this fires — name the plan the household is leaving, not the one it's on now.
      const change = await this.prisma.subscriptionChange.findFirst({ where: { subscriptionId: payload.subscriptionId, type: "EXPIRED" }, orderBy: { createdAt: "desc" }, select: { fromPlanId: true } });
      const planName = await this.planNames(change?.fromPlanId ?? undefined);
      await this.notifyHousehold(payload.householdId, "subscription.expired", planName, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionCancelRequested")
  onCancelRequested(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionCancelRequested", async () => {
      await this.notifyHousehold(payload.householdId, "subscription.cancel_scheduled", { fa: "", en: "" }, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionCancelReversed")
  onCancelReversed(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionCancelReversed", async () => {
      await this.notifyHousehold(payload.householdId, "subscription.cancel_reversed", { fa: "", en: "" }, payload.subscriptionId, domainEventId);
    });
  }

  @OnEvent("SubscriptionDowngradeScheduled")
  onDowngradeScheduled(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionDowngradeScheduled", async () => {
      const planName = await this.planNames(payload.toPlanId);
      await this.notifyHousehold(payload.householdId, "subscription.downgrade_scheduled", planName, payload.subscriptionId, domainEventId);
    });
  }

  /** Only ever published when a scheduled downgrade actually takes effect at a period boundary — see SubscriptionBillingService.attemptRenewal's own doc comment. */
  @OnEvent("SubscriptionPlanChanged")
  onPlanChanged(payload: PlanChangedPayload, domainEventId: string): Promise<void> {
    return this.safely("SubscriptionPlanChanged", async () => {
      const planName = await this.planNames(payload.toPlanId);
      await this.notifyHousehold(payload.householdId, "subscription.downgrade_applied", planName, payload.subscriptionId, domainEventId);
    });
  }
}
