import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CartStatus,
  CheckoutStatus,
  HouseholdRole,
  PaymentMethodType,
  PaymentProvider,
  Prisma,
  RefundStatus,
  SubscriptionBillingAttemptStatus,
  SubscriptionBillingReason,
  SubscriptionChangeType,
  SubscriptionPeriodStatus,
  SubscriptionStatus,
  type SubscriptionBillingInterval,
} from "@prisma/client";
import type { SubscriptionBillingAttemptDto, SubscriptionDto } from "@petlife/types";
import type { AppEnv } from "../../config/env";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { SubscriptionBillingAttemptNotFoundException, SubscriptionBillingAttemptNotRefundableException } from "../../common/errors/api-exception";
import { PaymentsService } from "../commerce/payments/payments.service";
import type { PaymentChargeMode } from "../commerce/payments/payment-gateway.interface";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionPlanReadService } from "./subscription-plan-read.service";
import { addBillingInterval, addDays } from "./subscription-date.util";
import { resolveHouseholdCountry } from "./household-country.util";
import { SUBSCRIPTION_INCLUDE, toBillingAttemptDto, toSubscriptionDto, type SubscriptionWithRelations } from "./subscription-mapper";

export interface BillingOutcome {
  attempt: SubscriptionBillingAttemptDto | null;
  subscription: SubscriptionDto;
}

/**
 * The one place H16 talks to H07 (spec: "reuse H07... subscription billing
 * should use existing PaymentIntent/PaymentAttempt/Transaction/Refund/
 * LedgerEntry... do not merge subscription state into PaymentIntent").
 *
 * `PaymentIntent.checkoutId` is a required FK to the real commerce
 * `Checkout` model (which itself requires a `Cart`) — this heavily-relied-
 * upon H06/H07 pair could not be loosened without touching
 * `CheckoutService`/`OrdersService`/`InventoryReservationService` and every
 * caller that assumes a Checkout always has real cart lines. Rather than
 * forcing a subscription purchase through that physical-goods pipeline (or
 * risking a schema change to core commerce models), this service creates a
 * minimal internal Checkout/Cart shell purely to satisfy the FK:
 *   - the shell Cart's `status` is `CONVERTED` from creation, never
 *     `ACTIVE`, so `CartService.getCart()`'s own `findFirst({status:
 *     ACTIVE})` query can never mistake it for the household's real
 *     shopping cart;
 *   - it is never routed through `CheckoutService` at all — this service
 *     calls `PaymentsService.createIntent()`/`charge()` directly and
 *     handles the outcome itself, so `CheckoutService.finalizeSuccessfulPayment()`
 *     (which creates Orders/Fulfillments) never runs against it;
 *   - only the *synchronous* `charge()` path is ever used (DEV_SIMULATED),
 *     never `resolvePendingIntent()` — the existing `PaymentEventsListener`
 *     only reacts when `viaWebhook: true`, which a synchronous charge never
 *     sets, so it can never react to a subscription's PaymentIntent either.
 * `NotificationEventsListener`'s generic "payment.succeeded" handler was
 * additionally taught to skip a checkout whose cart has zero line items
 * (see that listener's own comment) so a subscriber never gets a confusing
 * "see My Orders" notification alongside the correct subscription one.
 *
 * Revenue posting mirrors `SellerFinanceService`'s own two-step shape
 * exactly: `LedgerService.recordPaymentSucceeded()` (unchanged, H07) moves
 * cash into `CUSTOMER_PAYMENT_CLEARING`, then `recordSubscriptionRevenue()`
 * (Handoff 16's own addition, mirroring `recordSellerAttribution`) posts
 * the full amount straight to `PLATFORM_REVENUE` — there is no seller leg
 * for subscription revenue at all.
 *
 * Every method here row-locks the `Subscription` row itself
 * (`SELECT ... FOR UPDATE`) before reading or writing anything else in the
 * same transaction — the actual mechanism behind "test concurrent:
 * subscription creation, renewal, upgrade, cancel, payment success" (spec):
 * two racing purchase/upgrade/renewal calls for the same household can
 * never both proceed past the lock, so at most one ever creates a period
 * or posts revenue for a given moment in that subscription's life.
 */
@Injectable()
export class SubscriptionBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly subscriptions: SubscriptionService,
    private readonly plans: SubscriptionPlanReadService,
    private readonly events: DomainEventsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private async createShellCheckout(tx: Prisma.TransactionClient, userId: string, householdId: string, amount: number, currency: string) {
    const cart = await tx.cart.create({ data: { userId, householdId, status: CartStatus.CONVERTED } });
    return tx.checkout.create({
      data: {
        userId,
        householdId,
        cartId: cart.id,
        paymentMethodType: PaymentMethodType.ONLINE_PAYMENT,
        status: CheckoutStatus.READY_FOR_PAYMENT,
        subtotalAmount: amount,
        totalAmount: amount,
        currency,
      },
    });
  }

  /** For a system-initiated renewal, there is no request-bound acting user — the household's own OWNER (falling back to any member) is the acting identity for the shell Checkout's `userId`, purely for record-keeping; it never gates authorization (the renewal worker is not a user-facing endpoint). */
  private async resolveActingUserId(tx: Prisma.TransactionClient, householdId: string): Promise<string> {
    const owner = await tx.householdMember.findFirst({ where: { householdId, role: HouseholdRole.OWNER }, orderBy: { createdAt: "asc" } });
    if (owner) return owner.userId;
    const any = await tx.householdMember.findFirstOrThrow({ where: { householdId }, orderBy: { createdAt: "asc" } });
    return any.userId;
  }

  private async lockSubscription(tx: Prisma.TransactionClient, subscriptionId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId}::uuid FOR UPDATE`;
  }

  /**
   * Shared by initial purchase and upgrade — both are "pay now, get the new
   * plan's entitlements immediately" (spec: "upgrade effective immediately
   * after successful payment... a simple no-proration model is acceptable
   * for first release"). **H16 proration policy: none.** An upgrade charges
   * the new plan's full price and starts a brand-new period from now; the
   * unused portion of whatever period preceded it is not credited or
   * refunded. This is deliberately the simpler of the two policies the spec
   * offers, chosen because it needs no floating-point/rounding logic and is
   * trivially auditable (see README "Upgrade/downgrade").
   */
  async purchase(
    householdId: string,
    userId: string,
    planId: string,
    billingInterval: SubscriptionBillingInterval,
    reason: typeof SubscriptionBillingReason.INITIAL | typeof SubscriptionBillingReason.UPGRADE,
    idempotencyKey?: string,
    mode: PaymentChargeMode = "SUCCESS",
  ): Promise<BillingOutcome> {
    const countryCode = await resolveHouseholdCountry(this.prisma, householdId);
    const plan = await this.plans.getRawById(planId);
    this.plans.assertSubscribable(plan, countryCode);
    const price = await this.plans.resolveActivePrice(planId, countryCode, billingInterval);

    return this.prisma.$transaction(async (tx) => {
      const sub = await this.subscriptions.getOrCreateRaw(householdId, tx);
      await this.lockSubscription(tx, sub.id);

      if (idempotencyKey) {
        const existing = await tx.subscriptionBillingAttempt.findUnique({ where: { idempotencyKey } });
        if (existing) {
          const freshSub = await tx.subscription.findUniqueOrThrow({ where: { id: existing.subscriptionId }, include: SUBSCRIPTION_INCLUDE });
          return { attempt: toBillingAttemptDto(existing), subscription: toSubscriptionDto(freshSub) };
        }
      }

      const checkout = await this.createShellCheckout(tx, userId, householdId, price.amount, price.currency);
      const intent = await this.payments.createIntent(checkout.id, price.amount, price.currency, PaymentProvider.DEV_SIMULATED, undefined, tx);
      const attemptNumber = (await tx.subscriptionBillingAttempt.count({ where: { subscriptionId: sub.id } })) + 1;
      const attempt = await tx.subscriptionBillingAttempt.create({
        data: { subscriptionId: sub.id, reason, attemptNumber, paymentIntentId: intent.id, priceId: price.id, idempotencyKey, amount: price.amount, currency: price.currency, status: SubscriptionBillingAttemptStatus.PENDING },
      });

      const outcome = await this.payments.charge(intent.id, mode, tx);

      if (outcome.status !== "SUCCEEDED") {
        const failedAttempt = await tx.subscriptionBillingAttempt.update({
          where: { id: attempt.id },
          data: { status: SubscriptionBillingAttemptStatus.FAILED, failureCode: outcome.failureCode, failureReason: outcome.failureMessage, completedAt: new Date() },
        });
        return { attempt: toBillingAttemptDto(failedAttempt), subscription: toSubscriptionDto(sub) };
      }

      await tx.checkout.update({ where: { id: checkout.id }, data: { status: CheckoutStatus.CONFIRMED } });
      await this.ledger.recordPaymentSucceeded(attempt.id, price.amount, price.currency, tx);
      await this.ledger.recordSubscriptionRevenue(attempt.id, price.amount, price.currency, tx);

      const startAt = new Date();
      const period = await this.subscriptions.activatePeriod(tx, sub, planId, price.id, startAt, addBillingInterval(startAt, billingInterval));
      const succeededAttempt = await tx.subscriptionBillingAttempt.update({ where: { id: attempt.id }, data: { status: SubscriptionBillingAttemptStatus.SUCCEEDED, periodId: period.id, completedAt: new Date() } });
      await tx.subscriptionChange.create({
        data: { subscriptionId: sub.id, type: reason === SubscriptionBillingReason.INITIAL ? SubscriptionChangeType.INITIAL_PURCHASE : SubscriptionChangeType.UPGRADE, fromPlanId: sub.planId, toPlanId: planId, effectiveAt: startAt, initiatedByUserId: userId },
      });
      await this.events.publish(
        reason === SubscriptionBillingReason.INITIAL ? "SubscriptionStarted" : "SubscriptionUpgraded",
        { subscriptionId: sub.id, householdId, planId, isTrial: false },
        { tx, aggregateType: "Subscription", aggregateId: sub.id },
      );

      const finalSub = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: SUBSCRIPTION_INCLUDE });
      return { attempt: toBillingAttemptDto(succeededAttempt), subscription: toSubscriptionDto(finalSub) };
    });
  }

  /**
   * The renewal lifecycle (spec: "period nearing end -> renewal attempt ->
   * billing attempt record -> payment success/failure -> period extension
   * or PAST_DUE"). Called by `SubscriptionRenewalWorkerService`'s poll —
   * never by a request handler. Renewal is attempted once a period's
   * `endAt` has actually passed, not proactively N days in advance (a
   * deliberate simplification given a poller that already runs
   * frequently — see README "Known limitations"). Uses the exact same
   * `DEV_SIMULATED`/synchronous-charge path as a real purchase (spec: "if
   * real automatic recurring charge is not available through existing
   * provider adapters, be honest... support a DEV/manual adapter" — no
   * production autopay is simulated; this is that honest DEV adapter).
   *
   * A pending downgrade (spec: "at period boundary: apply target plan") is
   * resolved *before* charging: the boundary charge, if any, is for the
   * pending plan's own price, not the outgoing plan's — a household that
   * scheduled a downgrade is billed the lower amount starting at the very
   * renewal it takes effect. Downgrading to the FREE plan skips charging
   * entirely (there is nothing to charge for FREE) and returns with
   * `attempt: null` — a real billing attempt row is never created for a
   * charge that was never going to happen.
   */
  async attemptRenewal(subscriptionId: string, mode: PaymentChargeMode = "SUCCESS"): Promise<BillingOutcome | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSubscription(tx, subscriptionId);
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: SUBSCRIPTION_INCLUDE });
      if (!sub || !sub.currentPeriod) return null;
      const renewableStatuses: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD];
      if (!renewableStatuses.includes(sub.status)) return null;
      if (sub.currentPeriod.endAt > new Date()) return null;

      const hasPendingChange = sub.pendingPlanId !== null;
      const targetPlanId = hasPendingChange ? sub.pendingPlanId! : sub.planId;
      const targetPriceId = hasPendingChange ? sub.pendingPriceId : sub.priceId;

      if (!targetPriceId) {
        // Downgrading to (or already resolving toward) the FREE plan at the boundary — nothing to charge.
        if (sub.currentPeriodId) await tx.subscriptionPeriod.update({ where: { id: sub.currentPeriodId }, data: { status: SubscriptionPeriodStatus.ENDED } });
        const updated = await tx.subscription.update({
          where: { id: sub.id },
          data: { planId: targetPlanId, priceId: null, status: SubscriptionStatus.ACTIVE, currentPeriodId: null, pendingPlanId: null, pendingPriceId: null },
          include: SUBSCRIPTION_INCLUDE,
        });
        if (hasPendingChange) {
          await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.DOWNGRADE_APPLIED, fromPlanId: sub.planId, toPlanId: targetPlanId, effectiveAt: new Date() } });
          await this.events.publish("SubscriptionPlanChanged", { subscriptionId: sub.id, householdId: sub.householdId, fromPlanId: sub.planId, toPlanId: targetPlanId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
        }
        return { attempt: null, subscription: toSubscriptionDto(updated) };
      }

      const price = await tx.subscriptionPlanPrice.findUniqueOrThrow({ where: { id: targetPriceId } });
      const userId = await this.resolveActingUserId(tx, sub.householdId);
      const checkout = await this.createShellCheckout(tx, userId, sub.householdId, price.amount, price.currency);
      const intent = await this.payments.createIntent(checkout.id, price.amount, price.currency, PaymentProvider.DEV_SIMULATED, undefined, tx);
      const attemptNumber = (await tx.subscriptionBillingAttempt.count({ where: { subscriptionId: sub.id } })) + 1;
      const attempt = await tx.subscriptionBillingAttempt.create({
        data: { subscriptionId: sub.id, reason: SubscriptionBillingReason.RENEWAL, attemptNumber, paymentIntentId: intent.id, priceId: price.id, amount: price.amount, currency: price.currency, status: SubscriptionBillingAttemptStatus.PENDING },
      });

      const outcome = await this.payments.charge(intent.id, mode, tx);

      if (outcome.status !== "SUCCEEDED") {
        const failedAttempt = await tx.subscriptionBillingAttempt.update({
          where: { id: attempt.id },
          data: { status: SubscriptionBillingAttemptStatus.FAILED, failureCode: outcome.failureCode, failureReason: outcome.failureMessage, completedAt: new Date() },
        });
        const afterFailure = await this.applyRenewalFailure(tx, sub);
        return { attempt: toBillingAttemptDto(failedAttempt), subscription: toSubscriptionDto(afterFailure) };
      }

      await tx.checkout.update({ where: { id: checkout.id }, data: { status: CheckoutStatus.CONFIRMED } });
      await this.ledger.recordPaymentSucceeded(attempt.id, price.amount, price.currency, tx);
      await this.ledger.recordSubscriptionRevenue(attempt.id, price.amount, price.currency, tx);

      const wasRecovering = sub.status !== SubscriptionStatus.ACTIVE;
      const startAt = sub.currentPeriod.endAt > new Date() ? sub.currentPeriod.endAt : new Date();
      const period = await this.subscriptions.activatePeriod(tx, sub, targetPlanId, price.id, startAt, addBillingInterval(startAt, price.billingInterval));
      const succeededAttempt = await tx.subscriptionBillingAttempt.update({ where: { id: attempt.id }, data: { status: SubscriptionBillingAttemptStatus.SUCCEEDED, periodId: period.id, completedAt: new Date() } });
      const finalSub = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: SUBSCRIPTION_INCLUDE });

      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.RENEWED, effectiveAt: startAt } });
      if (hasPendingChange) {
        await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.DOWNGRADE_APPLIED, fromPlanId: sub.planId, toPlanId: targetPlanId, effectiveAt: startAt } });
        await this.events.publish("SubscriptionPlanChanged", { subscriptionId: sub.id, householdId: sub.householdId, fromPlanId: sub.planId, toPlanId: targetPlanId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      }
      await this.events.publish("SubscriptionRenewed", { subscriptionId: sub.id, householdId: sub.householdId, recovered: wasRecovering }, { tx, aggregateType: "Subscription", aggregateId: sub.id });

      return { attempt: toBillingAttemptDto(succeededAttempt), subscription: toSubscriptionDto(finalSub) };
    });
  }

  /**
   * ACTIVE -> PAST_DUE (first failure, short retry window) -> GRACE_PERIOD
   * (retry window elapsed, final warning window) -> EXPIRED (grace
   * elapsed) — see SubscriptionStatus's own doc comment for why these are
   * two distinct steps. `gracePeriodEndsAt` doubles as "the deadline for
   * whichever of these two windows is currently open," read on the next
   * worker tick to decide whether to escalate further.
   */
  private async applyRenewalFailure(tx: Prisma.TransactionClient, sub: SubscriptionWithRelations): Promise<SubscriptionWithRelations> {
    const pastDueRetryDays = this.config.get("SUBSCRIPTION_PAST_DUE_RETRY_DAYS", { infer: true });
    const gracePeriodDays = this.config.get("SUBSCRIPTION_GRACE_PERIOD_DAYS", { infer: true });
    const now = new Date();

    if (sub.status === SubscriptionStatus.ACTIVE) {
      this.subscriptions.assertTransition(sub.status, SubscriptionStatus.PAST_DUE);
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.PAST_DUE, gracePeriodEndsAt: addDays(now, pastDueRetryDays) }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.PAST_DUE, effectiveAt: now } });
      await this.events.publish("SubscriptionRenewalFailed", { subscriptionId: sub.id, householdId: sub.householdId, stage: "PAST_DUE" }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return updated;
    }

    if (sub.status === SubscriptionStatus.PAST_DUE && sub.gracePeriodEndsAt && sub.gracePeriodEndsAt <= now) {
      this.subscriptions.assertTransition(sub.status, SubscriptionStatus.GRACE_PERIOD);
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.GRACE_PERIOD, gracePeriodEndsAt: addDays(now, gracePeriodDays) }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.GRACE_STARTED, effectiveAt: now } });
      await this.events.publish("SubscriptionGraceStarted", { subscriptionId: sub.id, householdId: sub.householdId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return updated;
    }

    if (sub.status === SubscriptionStatus.GRACE_PERIOD && sub.gracePeriodEndsAt && sub.gracePeriodEndsAt <= now) {
      this.subscriptions.assertTransition(sub.status, SubscriptionStatus.EXPIRED);
      if (sub.currentPeriodId) await tx.subscriptionPeriod.update({ where: { id: sub.currentPeriodId }, data: { status: SubscriptionPeriodStatus.ENDED } });
      const updated = await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.EXPIRED, expiredAt: now }, include: SUBSCRIPTION_INCLUDE });
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.EXPIRED, effectiveAt: now } });
      await this.events.publish("SubscriptionExpired", { subscriptionId: sub.id, householdId: sub.householdId }, { tx, aggregateType: "Subscription", aggregateId: sub.id });
      return updated;
    }

    // Already PAST_DUE/GRACE_PERIOD but the current window hasn't elapsed yet — another failed retry inside the same window changes nothing further.
    return sub;
  }

  /**
   * Admin-triggered refund of one succeeded billing attempt (spec: "define
   * subscription refund behavior... at minimum support: refund reference,
   * entitlement impact policy, admin audit... do not automatically infer
   * subscription cancellation from an arbitrary payment refund unless
   * policy says so"). **H16 policy: a refund never mutates subscription
   * status by itself** — it posts a real `Refund` row and reverses the
   * ledger postings only; if the admin also wants to cancel/downgrade
   * access, that is a separate, explicit action through
   * `SubscriptionService`.
   */
  async refundBillingAttempt(billingAttemptId: string, reason: string, requestedByAdminUserId: string): Promise<void> {
    const attempt = await this.prisma.subscriptionBillingAttempt.findUnique({ where: { id: billingAttemptId } });
    if (!attempt) throw new SubscriptionBillingAttemptNotFoundException({ billingAttemptId });
    if (attempt.status !== SubscriptionBillingAttemptStatus.SUCCEEDED) throw new SubscriptionBillingAttemptNotRefundableException({ billingAttemptId, status: attempt.status });

    const existingRefund = attempt.paymentIntentId ? await this.prisma.refund.findFirst({ where: { paymentIntentId: attempt.paymentIntentId } }) : null;
    if (existingRefund) throw new SubscriptionBillingAttemptNotRefundableException({ billingAttemptId, reason: "ALREADY_REFUNDED" });

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: { paymentIntentId: attempt.paymentIntentId, amount: attempt.amount, currency: attempt.currency, status: RefundStatus.SUCCEEDED, reason, requestedByAdminUserId, completedAt: new Date() },
      });
      await this.ledger.recordRefundSucceeded(attempt.id, attempt.amount, attempt.currency, tx);
      await this.ledger.recordSubscriptionRevenueReversal(attempt.id, attempt.amount, attempt.currency, tx);
    });
  }
}
