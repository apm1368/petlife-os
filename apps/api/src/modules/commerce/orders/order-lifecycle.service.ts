import { Injectable, Logger } from "@nestjs/common";
import { FulfillmentStatus, InventoryMovementType, OrderRefundRequestStatus, Prisma, type Order } from "@prisma/client";
import type { RefundDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  OrderNotCancellableException,
  OrderNotFoundException,
  RefundNotSupportedException,
  RefundRequestNotAllowedException,
  RefundRequestNotFoundException,
} from "../../../common/errors/api-exception";
import { RefundsService } from "../refunds/refunds.service";
import { FulfillmentTransitionService } from "../logistics/fulfillment-transition.service";
import { InventoryMovementService } from "../inventory/inventory-movement.service";
import { CUSTOMER_CANCELLABLE_FULFILLMENT, canCustomerCancel, canCustomerRequestRefund } from "./order-policy";
import type { CreateRefundRequestDto } from "./dto/order-actions.dto";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Customer order actions (Batch 4). The eligibility policy lives in
 * order-policy.ts; money only moves through RefundsService, whose
 * advisory lock makes a double-click or two tabs safe.
 *
 * Cancel before dispatch = immediate full refund + fulfillment cancel +
 * restock, all committed together with the refund's SUCCEEDED state.
 * After dispatch the customer files a refund *request* that finance
 * reviews (AdminCommerce) — never an automatic refund.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly refunds: RefundsService,
    private readonly fulfillments: FulfillmentTransitionService,
    private readonly inventory: InventoryMovementService,
  ) {}

  private async loadOwned(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new OrderNotFoundException({ orderId });
    return order;
  }

  private primaryFulfillment(orderId: string) {
    return this.prisma.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } });
  }

  async cancel(userId: string, orderId: string, reason?: string): Promise<RefundDto> {
    const order = await this.loadOwned(userId, orderId);
    const fulfillment = await this.primaryFulfillment(orderId);
    if (!canCustomerCancel(order, fulfillment)) {
      throw new OrderNotCancellableException({ orderId, status: order.status, fulfillmentStatus: fulfillment?.status ?? null });
    }
    return this.cancelWithRefund(userId, order, reason);
  }

  /**
   * Legacy `POST orders/:id/refunds` (pre-Batch 4 clients). It used to refund
   * any order in any state — a customer could keep the goods and take the
   * money. It is now the same cancel-before-dispatch action, and returns the
   * historical REFUND_NOT_SUPPORTED error otherwise.
   */
  async legacyRefund(userId: string, orderId: string, reason?: string, amount?: number): Promise<RefundDto> {
    const order = await this.loadOwned(userId, orderId);
    if (amount !== undefined && amount !== order.totalAmount) {
      throw new RefundNotSupportedException({ orderId, reason: "Only a full refund of the order total is supported this phase" });
    }
    const fulfillment = await this.primaryFulfillment(orderId);
    if (!canCustomerCancel(order, fulfillment)) {
      throw new RefundNotSupportedException({ orderId, reason: "After dispatch, open a refund request for review instead" });
    }
    return this.cancelWithRefund(userId, order, reason);
  }

  /**
   * A seller that cannot fulfil cancels before dispatch; the customer is
   * always refunded in full in the same step. (The old
   * `orders/:id/fulfillment/cancel` route stopped delivery without any
   * refund and was removed.) The caller's seller membership is checked by
   * SellerAuthGuard; the order must belong to that seller.
   */
  async sellerCancel(sellerOrganizationId: string, actorUserId: string, orderId: string, reason: string): Promise<RefundDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.sellerOrganizationId !== sellerOrganizationId) throw new OrderNotFoundException({ orderId });
    const fulfillment = await this.primaryFulfillment(orderId);
    if (!order.userId || !canCustomerCancel(order, fulfillment)) {
      throw new OrderNotCancellableException({ orderId, status: order.status, fulfillmentStatus: fulfillment?.status ?? null });
    }
    return this.cancelWithRefund(order.userId, order, reason, { actor: "SELLER", actorUserId });
  }

  private cancelWithRefund(userId: string, order: Order, reason?: string, by: { actor: "CUSTOMER" | "SELLER"; actorUserId: string } = { actor: "CUSTOMER", actorUserId: userId }): Promise<RefundDto> {
    const cancelReason = reason?.trim() || (by.actor === "SELLER" ? "Cancelled by the seller before dispatch" : "Cancelled by customer before dispatch");
    return this.refunds.request(userId, order.id, cancelReason, undefined, {
      actorType: by.actor,
      actorId: by.actorUserId,
      onSucceeded: async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { cancelledAt: new Date(), cancelReason, cancelledBy: by.actor } });

        const fulfillment = await tx.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId: order.id, sequenceNumber: 1 } } });
        if (fulfillment && CUSTOMER_CANCELLABLE_FULFILLMENT.has(fulfillment.status)) {
          await this.fulfillments.transition(fulfillment.id, FulfillmentStatus.CANCELED, { tx, failureReason: "CUSTOMER_CANCELLED" });
        } else if (fulfillment && fulfillment.status !== FulfillmentStatus.CANCELED) {
          // The seller advanced the parcel in the milliseconds between the
          // eligibility check and the refund. Money is already back with the
          // customer; the seller sees the order as cancelled and must not ship.
          this.logger.warn(`Order ${order.id} cancelled while fulfillment was ${fulfillment.status}`);
        }

        const items = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { sellerOfferId: true, quantity: true } });
        for (const item of items) {
          const inventoryItem = await tx.inventoryItem.findUnique({ where: { sellerOfferId: item.sellerOfferId }, select: { id: true } });
          if (!inventoryItem) continue;
          await this.inventory.applyOnHandDelta(tx, {
            inventoryItemId: inventoryItem.id,
            sellerOrganizationId: order.sellerOrganizationId,
            delta: item.quantity,
            type: InventoryMovementType.ORDER_RELEASE,
            source: "ORDER_CANCELLATION",
            sourceReference: order.id,
            actorUserId: by.actorUserId,
          });
        }

        await this.events.publish(
          "OrderCancelled",
          { orderId: order.id, userId, sellerOrganizationId: order.sellerOrganizationId, cancelledBy: by.actor },
          { tx, aggregateType: "Order", aggregateId: order.id },
        );
      },
    });
  }

  async createRefundRequest(userId: string, orderId: string, dto: CreateRefundRequestDto) {
    const order = await this.loadOwned(userId, orderId);
    const [fulfillment, requests, items] = await Promise.all([
      this.primaryFulfillment(orderId),
      this.prisma.orderRefundRequest.findMany({ where: { orderId }, select: { status: true } }),
      this.prisma.orderItem.findMany({ where: { orderId }, select: { id: true } }),
    ]);
    if (!canCustomerRequestRefund(order, fulfillment, requests)) {
      throw new RefundRequestNotAllowedException({ orderId, status: order.status, fulfillmentStatus: fulfillment?.status ?? null });
    }
    const ownItemIds = new Set(items.map((i) => i.id));
    const orderItemIds = (dto.orderItemIds ?? []).filter((id) => ownItemIds.has(id));
    if ((dto.orderItemIds ?? []).length !== orderItemIds.length) throw new RefundRequestNotAllowedException({ orderId, reason: "ITEM_NOT_IN_ORDER" });

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.orderRefundRequest.create({
          data: {
            orderId,
            userId,
            reason: dto.reason,
            description: dto.description?.trim() || null,
            orderItemIds,
            // The refund path is full-order only (no partial captures refunds
            // are claimed); the requested amount is therefore the order total.
            requestedAmount: order.totalAmount,
          },
        });
        await this.events.publish(
          "OrderRefundRequested",
          { orderId, requestId: created.id, userId, sellerOrganizationId: order.sellerOrganizationId },
          { tx, aggregateType: "Order", aggregateId: orderId },
        );
        return created;
      });
      return this.toRequestDto(row);
    } catch (error) {
      // The partial unique index allows one open request per order.
      if (isUniqueViolation(error)) throw new RefundRequestNotAllowedException({ orderId, reason: "REQUEST_ALREADY_OPEN" });
      throw error;
    }
  }

  async withdrawRefundRequest(userId: string, orderId: string, requestId: string) {
    await this.loadOwned(userId, orderId);
    const result = await this.prisma.orderRefundRequest.updateMany({
      where: { id: requestId, orderId, userId, status: OrderRefundRequestStatus.PENDING_REVIEW },
      data: { status: OrderRefundRequestStatus.WITHDRAWN },
    });
    if (result.count === 0) throw new RefundRequestNotFoundException({ requestId });
    await this.events.publish("OrderRefundRequestWithdrawn", { orderId, requestId, userId }, { aggregateType: "Order", aggregateId: orderId });
    const row = await this.prisma.orderRefundRequest.findUniqueOrThrow({ where: { id: requestId } });
    return this.toRequestDto(row);
  }

  private toRequestDto(r: { id: string; status: string; reason: string; requestedAmount: number; decisionReason: string | null; createdAt: Date }) {
    return { id: r.id, status: r.status, reason: r.reason, requestedAmount: r.requestedAmount, decisionReason: r.decisionReason, createdAt: r.createdAt.toISOString() };
  }
}
