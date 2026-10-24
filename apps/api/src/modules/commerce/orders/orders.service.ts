import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma, RepeatDeliveryStatus, type Fulfillment, type FinancingIntent, type PaymentIntent, type Refund } from "@prisma/client";
import type { CartLineDto, FinancingIntentStatus, FulfillmentStatus, OrderDetailDto, OrderItemDto, OrderSummaryDto, PaymentIntentStatus, ProductCompatibilityDto, RefundStatus } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { OrderNotFoundException } from "../../../common/errors/api-exception";
import { toSellerSummaryDto } from "../commerce-dto.mapper";
import { toFulfillmentDto } from "../logistics/logistics-dto.mapper";
import { canCustomerCancel, canCustomerRequestRefund } from "./order-policy";
import { REPEAT_REMINDER_LEAD_DAYS } from "../repeat-delivery/repeat-delivery.service";

const ORDER_INCLUDE = {
  sellerOrganization: true,
  items: { include: { review: { select: { id: true } } } },
} satisfies Prisma.OrderInclude;

/** Customer-facing order number derived from the immutable id — short, stable, and never a second sequence to keep in sync. */
export function orderNumberOf(orderId: string): string {
  return `PL-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function toOrderItemDto(item: Prisma.OrderItemGetPayload<{ include: { review: { select: { id: true } } } }> | (Prisma.OrderItemGetPayload<object> & { review?: { id: string } | null })): OrderItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productVariantId: item.productVariantId,
    productTitleSnapshot: item.productTitleSnapshot,
    variantTitleSnapshot: item.variantTitleSnapshot,
    skuSnapshot: item.skuSnapshot,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    targetPetId: item.targetPetId,
    compatibilitySnapshot: item.compatibilitySnapshot as unknown as ProductCompatibilityDto | null,
    listUnitPrice: item.listUnitPrice,
    unitDiscount: item.unitDiscount,
    promotionName: item.promotionName,
    reviewId: item.review?.id ?? null,
  };
}

/** Picks the single "most relevant" intent per checkout for the summary/detail views (spec section 42) — a captured/approved one wins over a merely-pending one, which wins over anything else. */
function pickMostRelevant<T extends { status: string; createdAt: Date }>(rows: T[], terminalGoodStatuses: string[]): T | undefined {
  const terminal = rows.find((r) => terminalGoodStatuses.includes(r.status));
  if (terminal) return terminal;
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * "1 Checkout → N Orders" (spec section 29, 32) — one Order per seller,
 * made idempotent by `@@unique([checkoutId, sellerOrganizationId])` on the
 * Order model: a retried confirmation hits that constraint (caught below)
 * instead of ever creating a duplicate Order for the same seller, the same
 * P2002-catch pattern BookingsService already uses for slot double-booking.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Groups the checkout's priced lines by seller and creates one CONFIRMED
   * Order + its OrderItems per seller, inside the caller's transaction.
   * Every commercial fact (title/sku/price/compatibility) is copied at
   * this moment — an Order must never be re-rendered from mutable
   * Product/Offer rows later (spec section 31).
   */
  async createForCheckout(
    tx: Prisma.TransactionClient,
    checkout: { id: string; userId: string; householdId: string | null; deliveryAmount: number; discountAmount: number; currency: string },
    lines: CartLineDto[],
    shippingAddressId: string | null,
    shippingAddressSnapshot: Record<string, unknown> | null,
    /**
     * Per-seller shipping-price override (Handoff 08) — when a seller has a
     * SELECTED ShippingQuote, its own price becomes that Order's
     * `deliveryAmount` instead of the checkout-wide flat amount every
     * seller previously received in full (a pre-existing Handoff 06
     * simplification, kept as the fallback for any checkout that never
     * touches the shipping-quote flow — see ShippingOrchestrator).
     */
    deliveryAmountBySeller?: Map<string, number>,
  ): Promise<string[]> {
    const bySeller = new Map<string, CartLineDto[]>();
    for (const line of lines) {
      const key = line.sellerOffer.sellerOrganization.id;
      bySeller.set(key, [...(bySeller.get(key) ?? []), line]);
    }

    const orderIds: string[] = [];
    for (const [sellerOrganizationId, sellerLines] of bySeller) {
      // subtotal = gross list amount, discount = promotions, total = subtotal − discount + delivery.
      const subtotalAmount = sellerLines.reduce((sum, l) => sum + (l.listUnitPrice ?? l.currentPriceAmount) * l.quantity, 0);
      const discountAmount = sellerLines.reduce((sum, l) => sum + (l.unitDiscount ?? 0) * l.quantity, 0);
      // With carrier quotes each seller pays its own selected quote (0 when none); otherwise the flat method amount.
      const deliveryAmount = deliveryAmountBySeller ? (deliveryAmountBySeller.get(sellerOrganizationId) ?? 0) : checkout.deliveryAmount;
      const totalAmount = subtotalAmount - discountAmount + deliveryAmount;
      let createdItems: { id: string; promotionId: string | null; unitDiscount: number; quantity: number }[] | null = null;

      let order;
      try {
        order = await tx.order.create({
          data: {
            checkoutId: checkout.id,
            sellerOrganizationId,
            userId: checkout.userId,
            householdId: checkout.householdId,
            status: OrderStatus.CONFIRMED,
            subtotalAmount,
            deliveryAmount,
            discountAmount,
            totalAmount,
            currency: checkout.currency,
            shippingAddressId,
            shippingAddressSnapshot: (shippingAddressSnapshot ?? {}) as Prisma.InputJsonValue,
            confirmedAt: new Date(),
            items: {
              create: sellerLines.map((line) => ({
                productId: line.productId,
                productVariantId: line.sellerOffer.productVariantId,
                sellerOfferId: line.sellerOffer.id,
                productTitleSnapshot: line.productTitle,
                variantTitleSnapshot: line.variantTitle,
                skuSnapshot: line.variantSku,
                quantity: line.quantity,
                unitPrice: line.currentPriceAmount,
                totalPrice: line.lineTotal,
                listUnitPrice: line.listUnitPrice ?? line.currentPriceAmount,
                unitDiscount: line.unitDiscount ?? 0,
                promotionId: line.promotionId ?? null,
                promotionName: line.promotionName ?? null,
                targetPetId: line.targetPetId,
                compatibilitySnapshot: (line.compatibility ?? {}) as Prisma.InputJsonValue,
              })),
            },
          },
          include: { items: true },
        });
        createdItems = order.items;
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          const existing = await tx.order.findUnique({ where: { checkoutId_sellerOrganizationId: { checkoutId: checkout.id, sellerOrganizationId } } });
          if (!existing) throw error;
          order = existing;
        } else {
          throw error;
        }
      }

      orderIds.push(order.id);
      if (createdItems) {
        await tx.orderStatusEvent.create({ data: { orderId: order.id, fromStatus: null, toStatus: OrderStatus.CONFIRMED, actorType: "SYSTEM", reason: "PAYMENT_CONFIRMED" } });
        await this.recordPromotionRedemptions(tx, order.id, checkout.userId, createdItems);
        await this.advanceRepeatDeliveries(tx, order.id, checkout.userId, sellerLines);
      }
      await this.events.publish("OrderCreated", { orderId: order.id, checkoutId: checkout.id, sellerOrganizationId, userId: checkout.userId }, { tx, aggregateType: "Order", aggregateId: order.id });
      await this.events.publish("OrderConfirmed", { orderId: order.id, checkoutId: checkout.id }, { tx, aggregateType: "Order", aggregateId: order.id });
    }

    return orderIds;
  }

  /**
   * One redemption per discounted item, and the promotion's usage counter
   * moves in the same transaction. The DB CHECK (usageCount <= usageLimit)
   * makes an exhausted promotion fail the confirmation rather than
   * over-redeem — CheckoutService then refunds (PAYMENT_SUCCEEDED_ORDER_ISSUE).
   */
  private async recordPromotionRedemptions(tx: Prisma.TransactionClient, orderId: string, userId: string, items: { id: string; promotionId: string | null; unitDiscount: number; quantity: number }[]): Promise<void> {
    // usageCount counts orders that used the promotion, not units.
    const usedPromotions = new Set<string>();
    for (const item of items) {
      if (!item.promotionId || item.unitDiscount <= 0) continue;
      await tx.promotionRedemption.create({ data: { promotionId: item.promotionId, orderId, orderItemId: item.id, userId, amount: item.unitDiscount * item.quantity } });
      usedPromotions.add(item.promotionId);
    }
    for (const promotionId of usedPromotions) {
      await tx.promotion.update({ where: { id: promotionId }, data: { usageCount: { increment: 1 } } });
    }
  }

  /**
   * A checkout containing a repeat-delivery item that is inside its reminder
   * window (or overdue) completes that cycle: the schedule records the order
   * and moves to its next date. Items bought outside the window are ordinary
   * one-off purchases and leave the schedule untouched.
   */
  private async advanceRepeatDeliveries(tx: Prisma.TransactionClient, orderId: string, userId: string, lines: CartLineDto[]): Promise<void> {
    const offerIds = lines.map((l) => l.sellerOffer.id);
    const windowEnd = new Date(Date.now() + REPEAT_REMINDER_LEAD_DAYS * 86_400_000);
    const schedules = await tx.repeatDeliverySchedule.findMany({ where: { userId, sellerOfferId: { in: offerIds }, status: RepeatDeliveryStatus.ACTIVE, nextCycleAt: { lte: windowEnd } } });
    for (const schedule of schedules) {
      let next = schedule.nextCycleAt.getTime() + schedule.intervalDays * 86_400_000;
      while (next < Date.now()) next += schedule.intervalDays * 86_400_000;
      await tx.repeatDeliverySchedule.update({ where: { id: schedule.id }, data: { lastOrderId: orderId, nextCycleAt: new Date(next), reminderSentAt: null } });
      await tx.repeatDeliveryEvent.create({ data: { scheduleId: schedule.id, type: "ORDERED", actorId: userId, data: { orderId, next: new Date(next).toISOString() } } });
    }
  }

  async list(userId: string): Promise<OrderSummaryDto[]> {
    const orders = await this.prisma.order.findMany({ where: { userId }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" } });
    if (orders.length === 0) return [];

    // Marketplace-origin Orders (Handoff 09) have a null checkoutId and are excluded here anyway
    // (this query is already scoped to `where: { userId }`, and a marketplace Order's userId is
    // null) — filtered defensively so the `in` filter below never receives a null.
    const checkoutIds = [...new Set(orders.map((o) => o.checkoutId).filter((id): id is string => id !== null))];
    const orderIds = orders.map((o) => o.id);
    const [paymentIntents, financingIntents, refunds, fulfillments] = await Promise.all([
      this.prisma.paymentIntent.findMany({ where: { checkoutId: { in: checkoutIds } } }),
      this.prisma.financingIntent.findMany({ where: { checkoutId: { in: checkoutIds } } }),
      this.prisma.refund.findMany({ where: { orderId: { in: orderIds } }, orderBy: { createdAt: "desc" } }),
      this.prisma.fulfillment.findMany({ where: { orderId: { in: orderIds }, sequenceNumber: 1 } }),
    ]);

    return orders.map((order) => this.toSummaryDto(order, paymentIntents, financingIntents, refunds, fulfillments));
  }

  async getById(userId: string, id: string): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { ...ORDER_INCLUDE, shippingAddress: true, statusEvents: { orderBy: { createdAt: "asc" } }, refundRequests: { orderBy: { createdAt: "desc" } } },
    });
    if (!order) throw new OrderNotFoundException({ orderId: id });
    if (order.userId !== userId) throw new OrderNotFoundException({ orderId: id });

    const [paymentIntents, financingIntents, refunds, fulfillment] = await Promise.all([
      order.checkoutId ? this.prisma.paymentIntent.findMany({ where: { checkoutId: order.checkoutId } }) : Promise.resolve([]),
      order.checkoutId ? this.prisma.financingIntent.findMany({ where: { checkoutId: order.checkoutId } }) : Promise.resolve([]),
      this.prisma.refund.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" } }),
      this.prisma.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId: id, sequenceNumber: 1 } } }),
    ]);
    const paymentStatus = pickMostRelevant(paymentIntents, ["CAPTURED"])?.status as PaymentIntentStatus | undefined;
    const financingStatus = pickMostRelevant(financingIntents, ["APPROVED"])?.status as FinancingIntentStatus | undefined;

    return {
      id: order.id,
      checkoutId: order.checkoutId,
      sellerOrganization: toSellerSummaryDto(order.sellerOrganization),
      status: order.status as unknown as OrderDetailDto["status"],
      paymentStatus: paymentStatus ?? null,
      financingStatus: financingStatus ?? null,
      refunds: refunds.map((r) => this.toRefundDto(r)),
      fulfillment: fulfillment ? toFulfillmentDto(fulfillment) : null,
      subtotalAmount: order.subtotalAmount,
      deliveryAmount: order.deliveryAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      shippingAddress: order.shippingAddress
        ? {
            id: order.shippingAddress.id,
            householdId: order.shippingAddress.householdId,
            label: order.shippingAddress.label,
            recipient: order.shippingAddress.recipient,
            phone: order.shippingAddress.phone,
            addressLine: order.shippingAddress.addressLine,
            city: order.shippingAddress.city,
            region: order.shippingAddress.region,
            countryCode: order.shippingAddress.countryCode,
            latitude: order.shippingAddress.latitude,
            longitude: order.shippingAddress.longitude,
            instructions: order.shippingAddress.instructions,
          }
        : null,
      items: order.items.map(toOrderItemDto),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      orderNumber: orderNumberOf(order.id),
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      timeline: order.statusEvents.map((e) => ({ toStatus: e.toStatus, fromStatus: e.fromStatus, actorType: e.actorType, reason: e.reason, createdAt: e.createdAt.toISOString() })),
      refundRequests: order.refundRequests.map((r) => ({ id: r.id, status: r.status, reason: r.reason, requestedAmount: r.requestedAmount, decisionReason: r.decisionReason, createdAt: r.createdAt.toISOString() })),
      canCancel: canCustomerCancel(order, fulfillment),
      canRequestRefund: canCustomerRequestRefund(order, fulfillment, order.refundRequests),
    };
  }

  private toRefundDto(r: Refund) {
    return {
      id: r.id,
      paymentIntentId: r.paymentIntentId,
      financingIntentId: r.financingIntentId,
      orderId: r.orderId,
      amount: r.amount,
      currency: r.currency,
      status: r.status as unknown as RefundStatus,
      reason: r.reason,
      providerReference: r.providerReference,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    };
  }

  private toSummaryDto(order: OrderWithRelations, paymentIntents: PaymentIntent[], financingIntents: FinancingIntent[], refunds: Refund[], fulfillments: Fulfillment[]): OrderSummaryDto {
    const paymentStatus = pickMostRelevant(
      paymentIntents.filter((i) => i.checkoutId === order.checkoutId),
      ["CAPTURED"],
    )?.status as PaymentIntentStatus | undefined;
    const financingStatus = pickMostRelevant(
      financingIntents.filter((i) => i.checkoutId === order.checkoutId),
      ["APPROVED"],
    )?.status as FinancingIntentStatus | undefined;
    const refundStatus = refunds.find((r) => r.orderId === order.id)?.status as unknown as RefundStatus | undefined;
    const fulfillmentStatus = fulfillments.find((f) => f.orderId === order.id)?.status as unknown as FulfillmentStatus | undefined;

    return {
      id: order.id,
      checkoutId: order.checkoutId,
      sellerOrganization: toSellerSummaryDto(order.sellerOrganization),
      status: order.status as unknown as OrderSummaryDto["status"],
      paymentStatus: paymentStatus ?? null,
      financingStatus: financingStatus ?? null,
      refundStatus: refundStatus ?? null,
      fulfillmentStatus: fulfillmentStatus ?? null,
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: order.totalAmount,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      orderNumber: orderNumberOf(order.id),
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      previewTitles: order.items.slice(0, 3).map((i) => i.productTitleSnapshot),
    };
  }
}
