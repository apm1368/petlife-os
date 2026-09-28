import { Injectable } from "@nestjs/common";
import { FinancingIntentStatus, OrderStatus, PaymentIntentStatus, PaymentMethodType, Prisma, RefundStatus, type Refund } from "@prisma/client";
import type { RefundDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { OrderNotFoundException, RefundFailedException, RefundNotFoundException, RefundNotSupportedException } from "../../../common/errors/api-exception";
import { PaymentGatewayRegistry } from "../payments/payment-gateway-registry.service";
import { FinancingProviderRegistry } from "../financing/financing-provider-registry.service";
import { LedgerService } from "../ledger/ledger.service";
import { SellerFinanceService } from "../../seller-finance/seller-finance.service";

function toDto(refund: Refund): RefundDto {
  return {
    id: refund.id,
    paymentIntentId: refund.paymentIntentId,
    financingIntentId: refund.financingIntentId,
    orderId: refund.orderId,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status as unknown as RefundDto["status"],
    reason: refund.reason,
    providerReference: refund.providerReference,
    createdAt: refund.createdAt.toISOString(),
    updatedAt: refund.updatedAt.toISOString(),
    completedAt: refund.completedAt?.toISOString() ?? null,
  };
}

/**
 * Extra work committed in the same transaction that marks a refund
 * SUCCEEDED (Batch 4): the order-lifecycle layer uses it to cancel the
 * fulfillment and restock, so "refunded" and "cancelled" can never diverge.
 */
export interface RefundExecutionOptions {
  actorType?: "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM";
  actorId?: string | null;
  onSucceeded?: (tx: Prisma.TransactionClient, refund: Refund) => Promise<void>;
}

/**
 * Refund basics (spec sections 23-26) — full refund only this phase (spec:
 * "do not claim partial refund support for SnappPay/DigiPay unless official
 * docs confirm it"; DEV_SIMULATED/STANDARD_GATEWAY's own
 * `supportsPartialRefund` is likewise never exercised by this endpoint,
 * kept simple on purpose). A consumer/dev convenience surface, not a real
 * support/dispute workflow (spec section 26: "consumer refund initiation
 * may be limited... implement internal/dev refund route and owner-visible
 * status only") — any signed-in owner of the order can request one, since
 * no admin/support role model exists yet (see README Known limitations).
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly financingProviders: FinancingProviderRegistry,
    private readonly ledger: LedgerService,
    private readonly sellerFinance: SellerFinanceService,
  ) {}

  /**
   * The privileged refund primitive. Batch 4: never exposed to a customer
   * directly — customers reach it only through OrderLifecycleService
   * (cancel-before-dispatch) or through an admin-reviewed refund request
   * (AdminRefundService.execute). The eligibility policy lives there.
   */
  async request(userId: string, orderId: string, reason?: string, requestedAmount?: number, options: RefundExecutionOptions = {}): Promise<RefundDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new OrderNotFoundException({ orderId });
    // A marketplace-origin Order (Handoff 09) has no PET LIFE OS checkout/PaymentIntent to refund
    // through this path — it can never reach here anyway since its userId is null and never
    // equals a real caller's userId above, but this keeps checkoutId's non-null narrowing honest.
    if (!order.checkoutId) throw new OrderNotFoundException({ orderId });
    if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED) throw new RefundNotSupportedException({ orderId, reason: "Order already refunded or cancelled" });
    if (requestedAmount !== undefined && requestedAmount !== order.totalAmount) {
      throw new RefundNotSupportedException({ orderId, reason: "Only a full refund of the order total is supported this phase" });
    }

    const checkout = await this.prisma.checkout.findUniqueOrThrow({ where: { id: order.checkoutId } });
    const amount = order.totalAmount;

    if (checkout.paymentMethodType === PaymentMethodType.INSTALLMENTS) {
      return this.refundFinancing(userId, order.id, checkout.id, amount, order.currency, reason, options);
    }
    return this.refundPayment(userId, order.id, checkout.id, amount, order.currency, reason, options);
  }

  /** Terminal order bookkeeping shared by both refund paths: status, timeline and the caller's hook. */
  private async markOrderRefunded(tx: Prisma.TransactionClient, orderId: string, refund: Refund, reason: string | undefined, options: RefundExecutionOptions): Promise<void> {
    const before = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: before.status, toStatus: OrderStatus.REFUNDED, actorType: options.actorType ?? "SYSTEM", actorId: options.actorId ?? null, reason: reason ?? null },
    });
    if (options.onSucceeded) await options.onSucceeded(tx, refund);
  }

  /**
   * Emergency recovery path for spec section 21 ("Paid but order cannot
   * confirm") — there is deliberately no Order to attach this refund to
   * (that's exactly why this path exists: order confirmation itself
   * failed), so `orderId` stays null throughout. Called by
   * CheckoutService.finalizeSuccessfulPayment's own catch block, never by
   * a user-facing endpoint.
   */
  async refundForUnconfirmedCheckout(checkoutId: string, amount: number, currency: string, reason: string): Promise<RefundDto> {
    const checkout = await this.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    if (checkout.paymentMethodType === PaymentMethodType.INSTALLMENTS) {
      return this.refundFinancing(null, null, checkoutId, amount, currency, reason);
    }
    return this.refundPayment(null, null, checkoutId, amount, currency, reason);
  }

  /**
   * Refund of a standalone online payment that has no commerce Order (a
   * travel stay paid through an internal Checkout shell). Same gateway path,
   * advisory lock, duplicate guard and ledger reversal as order refunds; the
   * caller has already decided the amount from its own snapshotted terms.
   */
  async refundStandalonePayment(checkoutId: string, amount: number, currency: string, reason: string, requestedByUserId: string | null): Promise<RefundDto> {
    return this.refundPayment(requestedByUserId, null, checkoutId, amount, currency, reason);
  }

  private async refundPayment(userId: string | null, orderId: string | null, checkoutId: string, amount: number, currency: string, reason?: string, options: RefundExecutionOptions = {}): Promise<RefundDto> {
    // Handoff 20 hardening: a plain check-then-act here let two concurrent
    // refund requests for the same checkout both pass "no existing refund
    // yet" before either committed, both call the provider, and both
    // succeed — a real double refund. A transaction-scoped Postgres
    // advisory lock keyed by checkoutId, held only for the short
    // lock-check-create critical section (never across the external
    // gateway call below), serializes concurrent requests: the second one
    // blocks until the first commits its REQUESTED row, then immediately
    // sees it and is rejected.
    const { gateway, attempt, refund } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${checkoutId})::bigint)`;

      const intent = await tx.paymentIntent.findFirst({ where: { checkoutId, status: PaymentIntentStatus.CAPTURED }, orderBy: { createdAt: "desc" } });
      if (!intent) throw new RefundNotSupportedException({ checkoutId, reason: "No captured payment to refund" });

      const gateway = this.gateways.resolve(intent.provider);
      if (!gateway.capabilities.supportsRefund) throw new RefundNotSupportedException({ provider: intent.provider });

      const attempt = await tx.paymentAttempt.findFirst({ where: { paymentIntentId: intent.id, providerReference: { not: null } }, orderBy: { createdAt: "desc" } });
      if (!attempt?.providerReference) throw new RefundNotSupportedException({ checkoutId, reason: "No provider reference to refund against" });

      // One checkout pays for N seller orders, so the duplicate guard is per
      // order (per payment only for the no-order recovery path), and the sum
      // of live refunds can never exceed what was captured.
      const liveRefunds = await tx.refund.findMany({ where: { paymentIntentId: intent.id, status: { not: RefundStatus.FAILED } } });
      if (liveRefunds.some((r) => (orderId ? r.orderId === orderId : true))) {
        throw new RefundNotSupportedException({ checkoutId, reason: "A refund for this payment is already in progress or completed" });
      }
      const alreadyRefunded = liveRefunds.reduce((sum, r) => sum + r.amount, 0);
      if (alreadyRefunded + amount > intent.amount) throw new RefundNotSupportedException({ checkoutId, reason: "Refund would exceed the captured amount" });

      const refund = await tx.refund.create({
        data: { paymentIntentId: intent.id, orderId, amount, currency, status: RefundStatus.REQUESTED, reason: reason ?? null, requestedByUserId: userId },
      });
      return { gateway, attempt, refund };
    });
    await this.events.publish("RefundRequested", { refundId: refund.id, orderId, amount }, { aggregateType: "Refund", aggregateId: refund.id });

    let result;
    try {
      result = await gateway.refund({ providerReference: attempt.providerReference!, amount, currency, reason });
    } catch (error) {
      // A provider-call exception must never leave the refund stuck in
      // REQUESTED forever with no automatic recovery path — treat it the
      // same as an explicit FAILED result.
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED } });
      const message = error instanceof Error ? error.message : String(error);
      await this.events.publish("RefundFailed", { refundId: refund.id, orderId, reason: message }, { aggregateType: "Refund", aggregateId: refund.id });
      throw new RefundFailedException({ orderId, providerMessage: message });
    }

    if (result.status === "SUCCEEDED") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.SUCCEEDED, providerReference: result.providerRefundReference ?? null, completedAt: new Date() } });
        if (orderId) await this.markOrderRefunded(tx, orderId, row, reason, options);
        await this.ledger.recordRefundSucceeded(row.id, amount, currency, tx);
        if (orderId) await this.sellerFinance.applyRefundImpact(tx, orderId, row.id, amount, currency);
        return row;
      });
      await this.events.publish("RefundSucceeded", { refundId: refund.id, orderId, amount }, { aggregateType: "Refund", aggregateId: refund.id });
      return toDto(updated);
    }

    await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED } });
    await this.events.publish("RefundFailed", { refundId: refund.id, orderId, reason: result.failureMessage }, { aggregateType: "Refund", aggregateId: refund.id });
    throw new RefundFailedException({ orderId, providerMessage: result.failureMessage });
  }

  private async refundFinancing(userId: string | null, orderId: string | null, checkoutId: string, amount: number, currency: string, reason?: string, options: RefundExecutionOptions = {}): Promise<RefundDto> {
    // Same Handoff 20 hardening as refundPayment above: lock + duplicate
    // check + REQUESTED-row creation all happen inside one short
    // transaction, keyed by checkoutId, before any external provider call.
    const { provider, intentId, providerReference, refund } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${checkoutId})::bigint)`;

      const intent = await tx.financingIntent.findFirst({ where: { checkoutId, status: FinancingIntentStatus.APPROVED }, orderBy: { createdAt: "desc" } });
      if (!intent?.providerReference) throw new RefundNotSupportedException({ checkoutId, reason: "No approved financing to refund" });

      const provider = this.financingProviders.resolve(intent.provider);
      if (!provider.capabilities.supportsRefund) throw new RefundNotSupportedException({ provider: intent.provider });

      const existingRefund = await tx.refund.findFirst({ where: { financingIntentId: intent.id, status: { not: RefundStatus.FAILED } } });
      if (existingRefund) throw new RefundNotSupportedException({ checkoutId, reason: "A refund for this financing is already in progress or completed" });

      const refund = await tx.refund.create({
        data: { financingIntentId: intent.id, orderId, amount, currency, status: RefundStatus.REQUESTED, reason: reason ?? null, requestedByUserId: userId },
      });
      await tx.financingIntent.update({ where: { id: intent.id }, data: { status: FinancingIntentStatus.REFUND_PENDING } });
      return { provider, intentId: intent.id, providerReference: intent.providerReference, refund };
    });
    await this.events.publish("RefundRequested", { refundId: refund.id, orderId, amount }, { aggregateType: "Refund", aggregateId: refund.id });

    // BNPL refund is never treated identically to a card refund (spec
    // section 25): we store the provider's own reported outcome verbatim
    // and never compute an installment-schedule adjustment ourselves.
    let result;
    try {
      result = await provider.refund({ providerReference, amount, currency, reason });
    } catch (error) {
      // A provider-call exception must never leave the refund stuck in
      // REQUESTED/REFUND_PENDING forever with no automatic recovery path.
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED } });
        await tx.financingIntent.update({ where: { id: intentId }, data: { status: FinancingIntentStatus.APPROVED } });
      });
      const message = error instanceof Error ? error.message : String(error);
      await this.events.publish("RefundFailed", { refundId: refund.id, orderId, reason: message }, { aggregateType: "Refund", aggregateId: refund.id });
      throw new RefundFailedException({ orderId, providerMessage: message });
    }

    if (result.status === "SUCCEEDED") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.SUCCEEDED, providerReference: result.providerRefundReference ?? null, completedAt: new Date() } });
        if (orderId) await this.markOrderRefunded(tx, orderId, row, reason, options);
        await tx.financingIntent.update({ where: { id: intentId }, data: { status: FinancingIntentStatus.REFUNDED } });
        await this.ledger.recordRefundSucceeded(row.id, amount, currency, tx);
        if (orderId) await this.sellerFinance.applyRefundImpact(tx, orderId, row.id, amount, currency);
        return row;
      });
      await this.events.publish("RefundSucceeded", { refundId: refund.id, orderId, amount }, { aggregateType: "Refund", aggregateId: refund.id });
      return toDto(updated);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED } });
      // The refund attempt failing doesn't mean the loan itself is
      // invalid — restore APPROVED rather than leaving it stuck in
      // REFUND_PENDING forever.
      await tx.financingIntent.update({ where: { id: intentId }, data: { status: FinancingIntentStatus.APPROVED } });
    });
    await this.events.publish("RefundFailed", { refundId: refund.id, orderId, reason: result.failureMessage }, { aggregateType: "Refund", aggregateId: refund.id });
    throw new RefundFailedException({ orderId, providerMessage: result.failureMessage });
  }

  async listForOrder(userId: string, orderId: string): Promise<RefundDto[]> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new OrderNotFoundException({ orderId });
    const refunds = await this.prisma.refund.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
    return refunds.map(toDto);
  }

  async getById(userId: string, refundId: string): Promise<RefundDto> {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund || !refund.orderId) throw new RefundNotFoundException({ refundId });
    const order = await this.prisma.order.findUnique({ where: { id: refund.orderId } });
    if (!order || order.userId !== userId) throw new RefundNotFoundException({ refundId });
    return toDto(refund);
  }
}
