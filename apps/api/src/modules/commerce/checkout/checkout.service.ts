import { Injectable } from "@nestjs/common";
import { CartStatus, CheckoutStatus, DeliveryMethod, FinancingIntentStatus, PaymentMethodType, PaymentProvider, SellerOfferStatus } from "@prisma/client";
import type {
  CartDto,
  CartLineDto,
  CheckoutDto,
  CheckoutOpsDto,
  CheckoutValidationIssueDto,
  FinancingEligibilityStatus,
  FinancingIntentDto,
  PayCheckoutResultDto,
  PaymentMethodOptionDto,
} from "@petlife/types";
import { ProductCompatibilityStatus } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  CartEmptyException,
  CheckoutExpiredException,
  CheckoutNotFoundException,
  FinancingExpiredException,
  FinancingIntentNotFoundException,
  OfferNotAvailableException,
  PaymentAlreadyCompletedException,
  SafetyConflictException,
  SellerNotAvailableException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { HouseholdsService } from "../../households/households.service";
import { CartService } from "../cart/cart.service";
import { PaymentsService } from "../payments/payments.service";
import { PaymentGatewayRegistry } from "../payments/payment-gateway-registry.service";
import { OrdersService } from "../orders/orders.service";
import { FinancingService } from "../financing/financing.service";
import { FinancingProviderRegistry } from "../financing/financing-provider-registry.service";
import { LedgerService } from "../ledger/ledger.service";
import { RefundsService } from "../refunds/refunds.service";
import { InventoryReservationService, RESERVATION_TTL_MINUTES } from "./inventory-reservation.service";
import type { CreateCheckoutDto, PayCheckoutDto, UpdateCheckoutDto } from "./dto/checkout.dto";

/** Dev-calculated placeholder only (spec section 47) — no delivery integration exists this phase. Amounts are integer IRR. */
const DELIVERY_AMOUNT_BY_METHOD: Record<DeliveryMethod, number> = {
  [DeliveryMethod.STANDARD]: 0,
  [DeliveryMethod.EXPRESS]: 500_000,
};

function allLines(cart: CartDto): CartLineDto[] {
  return cart.sellerGroups.flatMap((g) => g.lines);
}

function computeValidationIssues(cart: CartDto): CheckoutValidationIssueDto[] {
  const issues: CheckoutValidationIssueDto[] = [];
  for (const line of allLines(cart)) {
    if (line.priceChanged) {
      issues.push({ code: "PRICE_CHANGED", cartLineId: line.id, message: `${line.productTitle}'s price changed since it was added to your cart.` });
    }
    if (line.compatibility?.status === ProductCompatibilityStatus.NEEDS_REVIEW || line.compatibility?.status === ProductCompatibilityStatus.NOT_RECOMMENDED) {
      issues.push({ code: "COMPATIBILITY_REVIEW_REQUIRED", cartLineId: line.id, message: `${line.productTitle} needs your review for this pet before purchase.` });
    }
  }
  return issues;
}

/**
 * Checkout is a snapshot-at-creation-time attempt over the cart (spec
 * section 25) — full revalidation happens at creation (spec section 26)
 * and inventory is reserved in the same transaction (spec section 38's
 * "Create Checkout → Reserve Inventory" ordering). Every hard-blocking
 * condition (unavailable offer/seller, insufficient inventory, an
 * unacknowledged safety conflict, an empty cart) throws; the two
 * advisory-only conditions (a price that moved, a NEEDS_REVIEW/
 * NOT_RECOMMENDED compatibility line) are returned as `validationIssues`
 * instead, per spec section 23's "prefer explicit acknowledgement... unless
 * product metadata marks hard block" — POTENTIAL_SAFETY_CONFLICT is the one
 * status this phase treats as that hard block.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
    private readonly cart: CartService,
    private readonly reservations: InventoryReservationService,
    private readonly payments: PaymentsService,
    private readonly paymentGateways: PaymentGatewayRegistry,
    private readonly orders: OrdersService,
    private readonly financing: FinancingService,
    private readonly financingProviders: FinancingProviderRegistry,
    private readonly ledger: LedgerService,
    private readonly refunds: RefundsService,
    private readonly events: DomainEventsService,
  ) {}

  private async assertAddressOwned(userId: string, addressId: string): Promise<string> {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address) throw new ValidationApiException({ field: "addressId", reason: "Address not found" });
    const membership = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: address.householdId, userId } } });
    if (!membership) throw new ValidationApiException({ field: "addressId", reason: "Address does not belong to your household" });
    return address.householdId;
  }

  async create(userId: string, dto: CreateCheckoutDto): Promise<CheckoutDto> {
    const cartRow = await this.cart.getOrCreateActiveCart(userId);
    const cartDto = await this.cart.getCart(userId);
    const lines = allLines(cartDto);
    if (lines.length === 0) throw new CartEmptyException();

    for (const line of lines) {
      if (line.sellerOffer.status !== SellerOfferStatus.ACTIVE) throw new OfferNotAvailableException({ cartLineId: line.id, offerId: line.sellerOffer.id });
      if (line.sellerOffer.sellerOrganization.verificationStatus !== "VERIFIED" || line.sellerOffer.sellerOrganization.status !== "ACTIVE") {
        throw new SellerNotAvailableException({ cartLineId: line.id, sellerOrganizationId: line.sellerOffer.sellerOrganization.id });
      }
      if (line.quantity > line.sellerOffer.availableQuantity) {
        throw new ValidationApiException({ field: "quantity", cartLineId: line.id, reason: "INSUFFICIENT_INVENTORY" });
      }
      if (line.compatibility?.status === ProductCompatibilityStatus.POTENTIAL_SAFETY_CONFLICT && !dto.acknowledgeSafetyConflict) {
        throw new SafetyConflictException({ cartLineId: line.id, productId: line.productId });
      }
    }

    let householdId = cartRow.householdId;
    if (dto.addressId) householdId = await this.assertAddressOwned(userId, dto.addressId);

    const deliveryMethod = dto.deliveryMethod ?? DeliveryMethod.STANDARD;
    const deliveryAmount = DELIVERY_AMOUNT_BY_METHOD[deliveryMethod];
    const subtotalAmount = cartDto.subtotalAmount;
    const totalAmount = subtotalAmount + deliveryAmount;
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000);

    const checkoutId = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.create({
        data: {
          userId,
          householdId,
          cartId: cartRow.id,
          addressId: dto.addressId ?? null,
          deliveryMethod,
          status: dto.addressId ? CheckoutStatus.READY_FOR_PAYMENT : CheckoutStatus.DRAFT,
          subtotalAmount,
          deliveryAmount,
          discountAmount: 0,
          totalAmount,
          currency: cartDto.currency,
          expiresAt,
        },
      });

      for (const line of lines) {
        await this.reservations.reserve(tx, checkout.id, line.sellerOffer.id, line.quantity, expiresAt);
      }

      await this.events.publish("CheckoutCreated", { checkoutId: checkout.id, userId, totalAmount }, { tx, aggregateType: "Checkout", aggregateId: checkout.id });
      return checkout.id;
    });

    return this.toDto(userId, checkoutId);
  }

  async update(userId: string, id: string, dto: UpdateCheckoutDto): Promise<CheckoutDto> {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.status !== CheckoutStatus.DRAFT && checkout.status !== CheckoutStatus.READY_FOR_PAYMENT) {
      throw new ValidationApiException({ field: "status", reason: "Checkout can no longer be edited" });
    }

    let householdId = checkout.householdId;
    if (dto.addressId) householdId = await this.assertAddressOwned(userId, dto.addressId);

    const deliveryMethod = dto.deliveryMethod ?? checkout.deliveryMethod;
    const deliveryAmount = DELIVERY_AMOUNT_BY_METHOD[deliveryMethod];
    const totalAmount = checkout.subtotalAmount + deliveryAmount - checkout.discountAmount;
    const addressId = dto.addressId ?? checkout.addressId;

    await this.prisma.checkout.update({
      where: { id },
      data: {
        addressId,
        householdId,
        deliveryMethod,
        deliveryAmount,
        totalAmount,
        status: addressId ? CheckoutStatus.READY_FOR_PAYMENT : CheckoutStatus.DRAFT,
      },
    });

    return this.toDto(userId, id);
  }

  async getById(userId: string, id: string): Promise<CheckoutDto> {
    await this.loadOwned(userId, id);
    return this.toDto(userId, id);
  }

  private async loadOwned(userId: string, id: string) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id } });
    if (!checkout) throw new CheckoutNotFoundException({ checkoutId: id });
    if (checkout.userId !== userId) throw new CheckoutNotFoundException({ checkoutId: id });
    return checkout;
  }

  async createPaymentIntent(userId: string, id: string, provider: PaymentProvider = PaymentProvider.DEV_SIMULATED, idempotencyKey?: string) {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.expiresAt && checkout.expiresAt < new Date()) throw new CheckoutExpiredException({ checkoutId: id });
    if (checkout.status !== CheckoutStatus.READY_FOR_PAYMENT && checkout.status !== CheckoutStatus.PAYMENT_PENDING) {
      throw new ValidationApiException({ field: "status", reason: "An address is required before a payment intent can be created" });
    }
    if (checkout.paymentMethodType === PaymentMethodType.INSTALLMENTS) {
      throw new ValidationApiException({ field: "paymentMethodType", reason: "This checkout already chose installments — create a financing intent instead" });
    }

    // Choosing to pay online (spec section 11) is committed here, the first
    // time a PaymentIntent is created for this checkout — never inferred
    // ahead of time, and never changeable afterward.
    if (checkout.paymentMethodType !== PaymentMethodType.ONLINE_PAYMENT) {
      await this.prisma.checkout.update({ where: { id }, data: { paymentMethodType: PaymentMethodType.ONLINE_PAYMENT } });
    }

    const intent = await this.payments.createIntent(checkout.id, checkout.totalAmount, checkout.currency, provider, idempotencyKey);
    return { id: intent.id, checkoutId: intent.checkoutId, amount: intent.amount, currency: intent.currency, status: intent.status, provider: intent.provider };
  }

  async pay(userId: string, id: string, dto: PayCheckoutDto): Promise<PayCheckoutResultDto> {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.status === CheckoutStatus.CONFIRMED) throw new PaymentAlreadyCompletedException({ checkoutId: id });

    if (checkout.expiresAt && checkout.expiresAt < new Date()) {
      await this.prisma.$transaction(async (tx) => {
        await this.reservations.releaseAllForCheckout(tx, id);
        await tx.checkout.update({ where: { id }, data: { status: CheckoutStatus.EXPIRED } });
      });
      throw new CheckoutExpiredException({ checkoutId: id });
    }

    const intent = await this.payments.getIntent(id);
    if (!intent) throw new ValidationApiException({ field: "paymentIntent", reason: "Create a payment intent before paying" });

    const outcome = await this.payments.charge(intent.id, dto.mode);

    let orderIds: string[] = [];
    if (outcome.status === "SUCCEEDED") {
      orderIds = await this.finalizeSuccessfulPayment(id);
    } else if (outcome.status === "PENDING") {
      await this.prisma.checkout.update({ where: { id }, data: { status: CheckoutStatus.PAYMENT_PENDING } });
    }
    // FAILED: checkout status is left untouched (still READY_FOR_PAYMENT) and reservations
    // are never released, so the exact same checkout can be retried immediately without
    // losing its place in the stock queue — see README "Payment failure".

    return { checkout: await this.toDto(userId, id), paymentStatus: outcome.status, failureCode: outcome.failureCode, failureMessage: outcome.failureMessage, orderIds };
  }

  /**
   * The single completion path for a successful charge — called
   * synchronously from `pay()`/`authorizeFinancing()` and, for a
   * pending intent resolved later, from the webhook-driven event listeners
   * (see PaymentEventsListener/FinancingEventsListener). Idempotent: a
   * checkout already CONFIRMED is a no-op (its existing order ids are
   * returned rather than recomputed), which is what makes a duplicate
   * webhook or a raced retry safe.
   *
   * Spec section 21 ("Paid but order cannot confirm") — inventory is
   * revalidated as part of the same transaction that consumes it
   * (InventoryReservationService throws if a reservation has expired or
   * gone missing); if that transaction fails for any reason, money has
   * already moved but no Order exists. Rather than surfacing a generic
   * FAILED, the checkout moves to the explicit
   * PAYMENT_SUCCEEDED_ORDER_ISSUE state and an automatic refund is
   * attempted immediately (spec: "attempt safe recovery; if impossible,
   * initiate refund; create support/ops signal") — the "ops signal" here is
   * the PaymentOrderConfirmationIssue-shaped state itself, inspectable via
   * `getOpsView`, since no separate ops alerting channel exists yet.
   */
  async finalizeSuccessfulPayment(checkoutId: string): Promise<string[]> {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId } });
    if (!checkout) return [];
    if (checkout.status === CheckoutStatus.CONFIRMED) {
      const existing = await this.prisma.order.findMany({ where: { checkoutId }, select: { id: true } });
      return existing.map((o) => o.id);
    }
    if (checkout.status === CheckoutStatus.PAYMENT_SUCCEEDED_ORDER_ISSUE) {
      return []; // already flagged for recovery — never retried automatically (see README)
    }

    const cartDto = await this.cart.getCart(checkout.userId);
    const lines = allLines(cartDto);
    const address = checkout.addressId ? await this.prisma.customerAddress.findUnique({ where: { id: checkout.addressId } }) : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.reservations.consumeAllForCheckout(tx, checkoutId);
        const orderIds = await this.orders.createForCheckout(
          tx,
          { id: checkout.id, userId: checkout.userId, householdId: checkout.householdId, deliveryAmount: checkout.deliveryAmount, discountAmount: checkout.discountAmount, currency: checkout.currency },
          lines,
          checkout.addressId,
          address ? { addressLine: address.addressLine, city: address.city, region: address.region, countryCode: address.countryCode, recipient: address.recipient, phone: address.phone } : null,
        );
        await tx.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatus.CONFIRMED } });
        await tx.cart.update({ where: { id: checkout.cartId }, data: { status: CartStatus.CONVERTED } });
        await this.ledger.recordPaymentSucceeded(checkout.id, checkout.totalAmount, checkout.currency, tx);
        await this.events.publish("CartConverted", { cartId: checkout.cartId, checkoutId }, { tx, aggregateType: "Cart", aggregateId: checkout.cartId });
        return orderIds;
      });
    } catch (error) {
      await this.prisma.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatus.PAYMENT_SUCCEEDED_ORDER_ISSUE } });
      const message = error instanceof Error ? error.message : String(error);
      await this.events.publish("PaymentReconciled", { checkoutId, action: "ORDER_CONFIRMATION_FAILED", error: message }, { aggregateType: "Checkout", aggregateId: checkoutId });
      try {
        await this.refunds.refundForUnconfirmedCheckout(checkoutId, checkout.totalAmount, checkout.currency, `Order confirmation failed: ${message}`);
      } catch {
        // The refund attempt itself failing is the genuine "impossible to
        // safely recover automatically" case — the checkout stays in
        // PAYMENT_SUCCEEDED_ORDER_ISSUE either way; getOpsView surfaces it
        // for manual follow-up rather than retrying silently forever.
      }
      return [];
    }
  }

  async getPaymentOptions(userId: string, id: string): Promise<PaymentMethodOptionDto[]> {
    await this.loadOwned(userId, id);
    const options: PaymentMethodOptionDto[] = [];
    for (const gateway of this.paymentGateways.listEnabled()) {
      if (gateway.capabilities.supportsDirectPayment) {
        options.push({ provider: gateway.provider as unknown as PaymentMethodOptionDto["provider"], methodType: "ONLINE_PAYMENT" as PaymentMethodOptionDto["methodType"], capabilities: gateway.capabilities });
      }
    }
    for (const provider of this.financingProviders.listEnabled()) {
      if (provider.capabilities.supportsInstallments) {
        options.push({ provider: provider.provider as unknown as PaymentMethodOptionDto["provider"], methodType: "INSTALLMENTS" as PaymentMethodOptionDto["methodType"], capabilities: provider.capabilities });
      }
    }
    return options;
  }

  async createFinancingIntent(userId: string, id: string, provider: PaymentProvider): Promise<FinancingIntentDto> {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.expiresAt && checkout.expiresAt < new Date()) throw new CheckoutExpiredException({ checkoutId: id });
    if (checkout.status !== CheckoutStatus.READY_FOR_PAYMENT && checkout.status !== CheckoutStatus.PAYMENT_PENDING) {
      throw new ValidationApiException({ field: "status", reason: "An address is required before a financing intent can be created" });
    }
    if (checkout.paymentMethodType === PaymentMethodType.ONLINE_PAYMENT) {
      throw new ValidationApiException({ field: "paymentMethodType", reason: "This checkout already chose online payment — create a payment intent instead" });
    }
    if (checkout.paymentMethodType !== PaymentMethodType.INSTALLMENTS) {
      await this.prisma.checkout.update({ where: { id }, data: { paymentMethodType: PaymentMethodType.INSTALLMENTS } });
    }

    const intent = await this.financing.createIntent(checkout.id, checkout.totalAmount, checkout.currency, provider);
    return this.financing.toDto(intent);
  }

  private async loadOwnedFinancingIntent(userId: string, checkoutId: string, financingId: string) {
    await this.loadOwned(userId, checkoutId);
    const intent = await this.financing.getById(financingId);
    if (intent.checkoutId !== checkoutId) throw new FinancingIntentNotFoundException({ financingIntentId: financingId });
    if (intent.expiresAt && intent.expiresAt < new Date() && intent.status === FinancingIntentStatus.AUTHORIZATION_PENDING) {
      throw new FinancingExpiredException({ financingIntentId: financingId });
    }
    return intent;
  }

  async getFinancingIntent(userId: string, checkoutId: string, financingId: string): Promise<FinancingIntentDto> {
    const intent = await this.loadOwnedFinancingIntent(userId, checkoutId, financingId);
    return this.financing.toDto(intent);
  }

  async checkFinancingEligibility(userId: string, checkoutId: string, financingId: string): Promise<{ status: FinancingEligibilityStatus }> {
    await this.loadOwnedFinancingIntent(userId, checkoutId, financingId);
    const status = await this.financing.checkEligibility(financingId);
    return { status };
  }

  async getFinancingPlans(userId: string, checkoutId: string, financingId: string) {
    await this.loadOwnedFinancingIntent(userId, checkoutId, financingId);
    return this.financing.getPlans(financingId);
  }

  async selectFinancingPlan(userId: string, checkoutId: string, financingId: string, providerPlanId: string): Promise<FinancingIntentDto> {
    await this.loadOwnedFinancingIntent(userId, checkoutId, financingId);
    const intent = await this.financing.selectPlan(financingId, providerPlanId);
    return this.financing.toDto(intent);
  }

  async authorizeFinancing(userId: string, checkoutId: string, financingId: string, mode?: "APPROVE" | "DECLINE" | "PENDING"): Promise<PayCheckoutResultDto> {
    const checkout = await this.loadOwned(userId, checkoutId);
    if (checkout.status === CheckoutStatus.CONFIRMED) throw new PaymentAlreadyCompletedException({ checkoutId });
    await this.loadOwnedFinancingIntent(userId, checkoutId, financingId);

    const outcome = await this.financing.authorize(financingId, mode);

    let orderIds: string[] = [];
    if (outcome.status === "APPROVED") {
      orderIds = await this.finalizeSuccessfulPayment(checkoutId);
    } else if (outcome.status === "PENDING") {
      await this.prisma.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatus.PAYMENT_PENDING } });
    }
    // DECLINED: checkout/cart/reservations are left fully untouched and
    // recoverable — an alternate payment method (a different provider, or
    // ONLINE_PAYMENT) is still possible for the exact same checkout (spec
    // section 40's "declined BNPL" UX: Try [other provider] / Pay Online /
    // Return to Cart), returned as a normal result rather than an
    // exception, exactly mirroring how pay() reports a card FAILURE.

    const paymentStatus = outcome.status === "APPROVED" ? "SUCCEEDED" : outcome.status === "DECLINED" ? "FAILED" : "PENDING";
    return { checkout: await this.toDto(userId, checkoutId), paymentStatus, failureCode: outcome.failureCode, failureMessage: outcome.failureMessage, orderIds };
  }

  async getOpsView(userId: string, id: string): Promise<CheckoutOpsDto> {
    await this.loadOwned(userId, id);
    const checkoutDto = await this.toDto(userId, id);

    const [paymentIntents, financingIntentRows, refundRows] = await Promise.all([
      this.prisma.paymentIntent.findMany({ where: { checkoutId: id }, include: { attempts: true, transactions: true }, orderBy: { createdAt: "asc" } }),
      this.prisma.financingIntent.findMany({ where: { checkoutId: id }, orderBy: { createdAt: "asc" } }),
      this.prisma.refund.findMany({ where: { OR: [{ paymentIntentId: { not: null } }, { financingIntentId: { not: null } }] }, orderBy: { createdAt: "asc" } }),
    ]);

    const paymentIntentIds = paymentIntents.map((i) => i.id);
    const financingIntentIds = financingIntentRows.map((i) => i.id);
    const scopedRefunds = refundRows.filter((r) => (r.paymentIntentId && paymentIntentIds.includes(r.paymentIntentId)) || (r.financingIntentId && financingIntentIds.includes(r.financingIntentId)));

    const providerEvents = await this.prisma.paymentProviderEvent.findMany({
      where: { OR: [{ paymentIntentId: { in: paymentIntentIds } }, { financingIntentId: { in: financingIntentIds } }] },
      orderBy: { receivedAt: "asc" },
    });
    const reconciliationLogs = await this.prisma.reconciliationLog.findMany({
      where: { referenceId: { in: [...paymentIntentIds, ...financingIntentIds] } },
      orderBy: { createdAt: "asc" },
    });

    const financingIntents = await Promise.all(financingIntentRows.map((i) => this.financing.toDto(i)));

    // A read-only aggregation of many Prisma enum-typed rows into their
    // @petlife/types DTO shapes — cast once here (field-for-field, same
    // names/shapes) rather than at each individual enum property, the way
    // toDto() does above for the single-model CheckoutDto case.
    return {
      checkout: checkoutDto,
      paymentIntents: paymentIntents.map((i) => ({ id: i.id, checkoutId: i.checkoutId, amount: i.amount, currency: i.currency, status: i.status, provider: i.provider })),
      paymentAttempts: paymentIntents.flatMap((i) =>
        i.attempts.map((a) => ({ id: a.id, paymentIntentId: a.paymentIntentId, provider: a.provider, providerReference: a.providerReference, status: a.status, failureCode: a.failureCode, failureMessage: a.failureMessage, createdAt: a.createdAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null })),
      ),
      transactions: paymentIntents.flatMap((i) =>
        i.transactions.map((t) => ({ id: t.id, paymentIntentId: t.paymentIntentId, type: t.type, amount: t.amount, currency: t.currency, status: t.status, createdAt: t.createdAt.toISOString() })),
      ),
      financingIntents,
      refunds: scopedRefunds.map((r) => ({
        id: r.id,
        paymentIntentId: r.paymentIntentId,
        financingIntentId: r.financingIntentId,
        orderId: r.orderId,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        providerReference: r.providerReference,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      providerEvents: providerEvents.map((e) => ({ id: e.id, provider: e.provider, providerEventId: e.providerEventId, eventType: e.eventType, status: e.status, receivedAt: e.receivedAt.toISOString(), processedAt: e.processedAt?.toISOString() ?? null, attemptCount: e.attemptCount, lastError: e.lastError })),
      reconciliationLogs: reconciliationLogs.map((l) => ({ id: l.id, provider: l.provider, referenceType: l.referenceType, referenceId: l.referenceId, localStatus: l.localStatus, remoteStatus: l.remoteStatus, action: l.action, createdAt: l.createdAt.toISOString() })),
    } as unknown as CheckoutOpsDto;
  }

  private async toDto(userId: string, checkoutId: string): Promise<CheckoutDto> {
    const checkout = await this.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const cartDto = await this.cart.getCart(userId);
    return {
      id: checkout.id,
      status: checkout.status as unknown as CheckoutDto["status"],
      addressId: checkout.addressId,
      deliveryMethod: checkout.deliveryMethod as unknown as CheckoutDto["deliveryMethod"],
      paymentMethodType: checkout.paymentMethodType as unknown as CheckoutDto["paymentMethodType"],
      subtotalAmount: checkout.subtotalAmount,
      deliveryAmount: checkout.deliveryAmount,
      discountAmount: checkout.discountAmount,
      totalAmount: checkout.totalAmount,
      currency: checkout.currency,
      sellerGroups: cartDto.sellerGroups,
      expiresAt: checkout.expiresAt?.toISOString() ?? null,
      validationIssues: computeValidationIssues(cartDto),
      createdAt: checkout.createdAt.toISOString(),
      updatedAt: checkout.updatedAt.toISOString(),
    };
  }
}
