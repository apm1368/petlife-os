import { Injectable } from "@nestjs/common";
import { Prisma, SubscriptionChangeType, SubscriptionPeriodStatus, SubscriptionStatus } from "@prisma/client";
import type { SubscriptionBillingHistoryDto, SubscriptionChangeDto, SubscriptionDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidSubscriptionStatusTransitionException, SubscriptionAlreadyCancelledException, SubscriptionTrialNotEligibleException } from "../../common/errors/api-exception";
import { SubscriptionPlanReadService } from "./subscription-plan-read.service";
import { resolveHouseholdCountry } from "./household-country.util";
import {
  CHANGE_INCLUDE,
  PERIOD_INCLUDE,
  SUBSCRIPTION_INCLUDE,
  toBillingAttemptDto,
  toChangeDto,
  toPeriodDto,
  toSubscriptionDto,
  type SubscriptionWithRelations,
} from "./subscription-mapper";

type QueryClient = PrismaService | Prisma.TransactionClient;

/**
 * The subscription state machine (spec: "use an explicit state machine...
 * define allowed transitions explicitly... never use payment status names
 * as subscription states"). See SubscriptionStatus's own doc comment in
 * schema.prisma for why PAST_DUE and GRACE_PERIOD are two distinct steps.
 * `CANCELLED`/`EXPIRED` are not dead ends — resubscribing (a fresh
 * `subscribe()`/`startTrial()` call) is exactly how a household returns
 * from either, reusing the same one-row-per-household Subscription record.
 */
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCEL_AT_PERIOD_END],
  [SubscriptionStatus.TRIALING]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCEL_AT_PERIOD_END],
  [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.CANCEL_AT_PERIOD_END],
  [SubscriptionStatus.GRACE_PERIOD]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCEL_AT_PERIOD_END],
  [SubscriptionStatus.CANCEL_AT_PERIOD_END]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.CANCELLED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
  [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
};

/** Statuses under which the subscription's *current* plan entitlements remain resolvable (spec: "do not revoke access immediately"). Only CANCELLED/EXPIRED fall back to the FREE plan. */
export const PAID_ACCESS_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.GRACE_PERIOD,
  SubscriptionStatus.CANCEL_AT_PERIOD_END,
];

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: SubscriptionPlanReadService,
    private readonly events: DomainEventsService,
  ) {}

  assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new InvalidSubscriptionStatusTransitionException({ from, to });
  }

  /** Every household gets a real row (spec: "prefer a real FREE plan"). Race-safe: a P2002 on the concurrent second caller's insert simply re-reads the winner's row. */
  async getOrCreateRaw(householdId: string, client: QueryClient = this.prisma): Promise<SubscriptionWithRelations> {
    const existing = await client.subscription.findUnique({ where: { householdId }, include: SUBSCRIPTION_INCLUDE });
    if (existing) return existing;

    const freePlan = await this.plans.getFreePlanRaw();
    try {
      return await client.subscription.create({
        data: { householdId, planId: freePlan.id, status: SubscriptionStatus.ACTIVE },
        include: SUBSCRIPTION_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return client.subscription.findUniqueOrThrow({ where: { householdId }, include: SUBSCRIPTION_INCLUDE });
      }
      throw error;
    }
  }

  /**
   * The actual mechanism behind "test concurrent: subscription creation,
   * renewal, upgrade, cancel" (spec) for every mutation that starts from a
   * householdId rather than an already-locked subscription row: get-or-
   * create the row (safe/idempotent on its own), then lock it by id
   * (`SELECT ... FOR UPDATE`, the same pattern `DisputeService.transition`/
   * `SupportCaseService.transition` already use), then re-read it fresh —
   * never validate a status transition or decide "is there a current
   * period to end" against the pre-lock snapshot, since a concurrent
   * transaction could have committed changes to this exact row while this
   * caller was still resolving that snapshot.
   */
  async lockAndGetCurrent(householdId: string, tx: Prisma.TransactionClient): Promise<SubscriptionWithRelations> {
    const sub = await this.getOrCreateRaw(householdId, tx);
    await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${sub.id}::uuid FOR UPDATE`;
    return tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: SUBSCRIPTION_INCLUDE });
  }

  async getCurrent(householdId: string): Promise<SubscriptionDto> {
    return toSubscriptionDto(await this.getOrCreateRaw(householdId));
  }

  async getBillingHistory(householdId: string): Promise<SubscriptionBillingHistoryDto> {
    const sub = await this.getOrCreateRaw(householdId);
    const [periods, attempts] = await Promise.all([
      this.prisma.subscriptionPeriod.findMany({ where: { subscriptionId: sub.id }, include: PERIOD_INCLUDE, orderBy: { startAt: "desc" } }),
      this.prisma.subscriptionBillingAttempt.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" } }),
    ]);
    const priceById = new Map((await this.prisma.subscriptionPlanPrice.findMany({ where: { id: { in: periods.map((p) => p.priceId).filter((id): id is string => Boolean(id)) } } })).map((p) => [p.id, p]));
    return {
      periods: periods.map((p) => toPeriodDto(p, p.priceId ? (priceById.get(p.priceId)?.amount ?? null) : null, p.priceId ? (priceById.get(p.priceId)?.currency ?? "IRR") : "IRR")),
      attempts: attempts.map(toBillingAttemptDto),
    };
  }

  async listChanges(subscriptionId: string): Promise<SubscriptionChangeDto[]> {
    const rows = await this.prisma.subscriptionChange.findMany({ where: { subscriptionId }, include: CHANGE_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toChangeDto);
  }

  /**
   * spec: "trial must not require fake payment success... trial
   * entitlements should be real subscription entitlements during trial."
   * No payment involved at all — a trial is a pure entitlement grant, gated
   * only by eligibility. `SubscriptionTrial`'s own `@@unique(householdId,
   * planId)` is the actual anti-abuse enforcement; the pre-check here just
   * gives a friendlier error than a raw constraint violation.
   */
  async startTrial(householdId: string, planId: string, userId: string): Promise<SubscriptionDto> {
    const plan = await this.plans.getRawById(planId);
    if (!plan.trialDays || plan.trialDays <= 0) throw new SubscriptionTrialNotEligibleException({ planId, reason: "PLAN_HAS_NO_TRIAL" });

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);

    try {
      return await this.prisma
        .$transaction(async (tx) => {
          const sub = await this.lockAndGetCurrent(householdId, tx);
          const trialEligibleStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED];
          if (!trialEligibleStatuses.includes(sub.status)) {
            throw new SubscriptionTrialNotEligibleException({ planId, reason: "ALREADY_SUBSCRIBED" });
          }
          this.assertTransition(sub.status, SubscriptionStatus.TRIALING);

          const alreadyTrialed = await tx.subscriptionTrial.findUnique({ where: { householdId_planId: { householdId, planId } } });
          if (alreadyTrialed) throw new SubscriptionTrialNotEligibleException({ planId, reason: "TRIAL_ALREADY_USED" });

          if (sub.currentPeriodId) await tx.subscriptionPeriod.update({ where: { id: sub.currentPeriodId }, data: { status: SubscriptionPeriodStatus.ENDED } });
          const period = await tx.subscriptionPeriod.create({ data: { subscriptionId: sub.id, planId, priceId: null, startAt, endAt, isTrial: true, status: SubscriptionPeriodStatus.ACTIVE } });
          const updated = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              planId,
              priceId: null,
              status: SubscriptionStatus.TRIALING,
              currentPeriodId: period.id,
              trialEndsAt: endAt,
              gracePeriodEndsAt: null,
              cancelRequestedAt: null,
              cancelEffectiveAt: null,
              pendingPlanId: null,
              pendingPriceId: null,
              expiredAt: null,
            },
            include: SUBSCRIPTION_INCLUDE,
          });
          await tx.subscriptionTrial.create({ data: { householdId, subscriptionId: sub.id, planId, startAt, endAt } });
          await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.TRIAL_STARTED, fromPlanId: sub.planId, toPlanId: planId, effectiveAt: startAt, initiatedByUserId: userId } });
          await this.events.publish("SubscriptionStarted", { subscriptionId: sub.id, householdId, planId, isTrial: true }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
          return updated;
        })
        .then(toSubscriptionDto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new SubscriptionTrialNotEligibleException({ planId, reason: "TRIAL_ALREADY_USED" });
      throw error;
    }
  }

  /**
   * spec: "downgrade scheduled for next billing period... do not
   * unexpectedly reduce paid entitlement mid-period." Only sets the
   * pending-plan pointer; `SubscriptionBillingService.attemptRenewal()`
   * (called by the renewal worker at the real period boundary) is what
   * actually flips the live plan, applying it before charging for the new
   * period so the household is billed the target plan's own price starting
   * at the very renewal it takes effect.
   */
  async scheduleDowngrade(householdId: string, targetPlanId: string, userId: string): Promise<SubscriptionDto> {
    const countryCode = await resolveHouseholdCountry(this.prisma, householdId);
    const targetPlan = await this.plans.getRawById(targetPlanId);
    if (!targetPlan.isFree) this.plans.assertSubscribable(targetPlan, countryCode);

    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await this.lockAndGetCurrent(householdId, tx);
      const interval = sub.price?.billingInterval;
      const targetPrice = targetPlan.isFree || !interval ? null : await this.plans.resolveActivePrice(targetPlanId, countryCode, interval);

      const row = await tx.subscription.update({ where: { id: sub.id }, data: { pendingPlanId: targetPlanId, pendingPriceId: targetPrice?.id ?? null }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({
        data: { subscriptionId: sub.id, type: SubscriptionChangeType.DOWNGRADE_SCHEDULED, fromPlanId: sub.planId, toPlanId: targetPlanId, effectiveAt: sub.currentPeriod?.endAt ?? sub.trialEndsAt ?? null, initiatedByUserId: userId },
      });
      await this.events.publish("SubscriptionDowngradeScheduled", { subscriptionId: sub.id, householdId, fromPlanId: sub.planId, toPlanId: targetPlanId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return row;
    });
    return toSubscriptionDto(updated);
  }

  /** spec: "no dark patterns... clearly state the access end date." */
  async cancelAtPeriodEnd(householdId: string, userId: string): Promise<SubscriptionDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await this.lockAndGetCurrent(householdId, tx);
      this.assertTransition(sub.status, SubscriptionStatus.CANCEL_AT_PERIOD_END);
      const effectiveAt = sub.currentPeriod?.endAt ?? sub.trialEndsAt ?? sub.gracePeriodEndsAt ?? new Date();

      const row = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.CANCEL_AT_PERIOD_END, cancelRequestedAt: new Date(), cancelEffectiveAt: effectiveAt }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.CANCEL_SCHEDULED, effectiveAt, initiatedByUserId: userId } });
      await this.events.publish("SubscriptionCancelRequested", { subscriptionId: sub.id, householdId, effectiveAt: effectiveAt.toISOString() }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return row;
    });
    return toSubscriptionDto(updated);
  }

  async resumeCancellation(householdId: string, userId: string): Promise<SubscriptionDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await this.lockAndGetCurrent(householdId, tx);
      if (sub.status !== SubscriptionStatus.CANCEL_AT_PERIOD_END) throw new SubscriptionAlreadyCancelledException({ status: sub.status });
      this.assertTransition(sub.status, SubscriptionStatus.ACTIVE);

      const row = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.ACTIVE, cancelRequestedAt: null, cancelEffectiveAt: null }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.CANCEL_REVERSED, initiatedByUserId: userId } });
      await this.events.publish("SubscriptionCancelReversed", { subscriptionId: sub.id, householdId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return row;
    });
    return toSubscriptionDto(updated);
  }

  /**
   * Admin-initiated cancellation (spec: "admin can cancel subscription
   * where authorized"). Deliberately reuses the same cancel-at-period-end
   * semantics as the consumer's own cancel — access continues to the
   * period's end, never stripped immediately (spec: "no dark patterns" /
   * "do not revoke access immediately") — recorded as `ADMIN_CANCELLED`
   * with `initiatedByAdminId` rather than a separate immediate-revoke code
   * path, since H16's scope never asks for an immediate-cancel option.
   */
  async adminCancel(householdId: string, adminUserId: string, reason?: string): Promise<SubscriptionDto> {
    const sub = await this.getOrCreateRaw(householdId);
    this.assertTransition(sub.status, SubscriptionStatus.CANCEL_AT_PERIOD_END);
    const effectiveAt = sub.currentPeriod?.endAt ?? sub.trialEndsAt ?? sub.gracePeriodEndsAt ?? new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.CANCEL_AT_PERIOD_END, cancelRequestedAt: new Date(), cancelEffectiveAt: effectiveAt }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.ADMIN_CANCELLED, effectiveAt, note: reason, initiatedByAdminId: adminUserId } });
      await this.events.publish("SubscriptionCancelRequested", { subscriptionId: sub.id, householdId, effectiveAt: effectiveAt.toISOString() }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return row;
    });
    return toSubscriptionDto(updated);
  }

  /** Applied by the renewal worker once `cancelEffectiveAt` has passed. */
  async applyCancelIfDue(tx: Prisma.TransactionClient, subscription: SubscriptionWithRelations): Promise<SubscriptionWithRelations> {
    if (subscription.status !== SubscriptionStatus.CANCEL_AT_PERIOD_END || !subscription.cancelEffectiveAt || subscription.cancelEffectiveAt > new Date()) return subscription;
    if (subscription.currentPeriodId) await tx.subscriptionPeriod.update({ where: { id: subscription.currentPeriodId }, data: { status: SubscriptionPeriodStatus.ENDED } });
    return tx.subscription.update({ where: { id: subscription.id }, data: { status: SubscriptionStatus.CANCELLED }, include: SUBSCRIPTION_INCLUDE });
  }

  /**
   * The one place a successful charge (initial purchase, upgrade, or
   * renewal) actually activates a period — called by
   * `SubscriptionBillingService` inside the same transaction as the
   * payment/ledger posting, never independently, so a period is never
   * created without the charge that funds it. Always lands on `ACTIVE`
   * (self-transition from an already-ACTIVE subscription — e.g. the
   * FREE-plan-to-paid-plan initial purchase, where `status` never actually
   * changes, only `planId`/`priceId` do — is deliberately exempt from
   * `assertTransition`, since it is not a status change at all).
   */
  async activatePeriod(tx: Prisma.TransactionClient, subscription: SubscriptionWithRelations, planId: string, priceId: string, startAt: Date, endAt: Date): Promise<{ id: string }> {
    if (subscription.status !== SubscriptionStatus.ACTIVE) this.assertTransition(subscription.status, SubscriptionStatus.ACTIVE);
    if (subscription.currentPeriodId) await tx.subscriptionPeriod.update({ where: { id: subscription.currentPeriodId }, data: { status: SubscriptionPeriodStatus.ENDED } });
    const period = await tx.subscriptionPeriod.create({ data: { subscriptionId: subscription.id, planId, priceId, startAt, endAt, isTrial: false, status: SubscriptionPeriodStatus.ACTIVE } });
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        planId,
        priceId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodId: period.id,
        trialEndsAt: null,
        gracePeriodEndsAt: null,
        cancelRequestedAt: null,
        cancelEffectiveAt: null,
        pendingPlanId: null,
        pendingPriceId: null,
        expiredAt: null,
      },
    });
    return period;
  }
}
