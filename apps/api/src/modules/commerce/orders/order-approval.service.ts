import { HttpStatus, Injectable } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import type { RefundDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ApiException, OrderNotFoundException } from "../../../common/errors/api-exception";
import { ShippingOrchestrator } from "../logistics/shipping-orchestrator.service";
import { SellerFinanceService } from "../../seller-finance/seller-finance.service";
import { ApprovalTaskService } from "../../approvals/approval-task.service";
import { approvalTaskKey } from "../../approvals/approval-policy";
import { OrderLifecycleService } from "./order-lifecycle.service";

export class OrderNotAwaitingApprovalException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ORDER_NOT_AWAITING_APPROVAL", "This order is not waiting for approval.", HttpStatus.CONFLICT, details);
  }
}

/**
 * Staff decision on a paid shop order held for approval (approval modes, shop orders = NEEDS_APPROVAL).
 *
 * Approve: PENDING → CONFIRMED and, in the same transaction, the seller's fulfillment (now AWAITING_SELLER_PREPARATION)
 * and seller attribution that checkout skipped for it; then the seller is told about the order.
 * Reject: the existing staff cancel-before-dispatch path — full refund through the gateway, stock returned, order
 * REFUNDED + cancelled — marked as "awaiting approval" so the seller, who never saw it, is not notified.
 * Both close the order's follow-up task. The caller (admin controller) audits.
 */
@Injectable()
export class OrderApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly logistics: ShippingOrchestrator,
    private readonly sellerFinance: SellerFinanceService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly approvalTasks: ApprovalTaskService,
  ) {}

  async approve(adminUserId: string, orderId: string, note?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Row lock: a double click, or an approve racing a reject or the member's cancel, decides once.
      await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new OrderNotFoundException({ orderId });
      if (order.status !== OrderStatus.PENDING || order.cancelledAt || !order.checkoutId) throw new OrderNotAwaitingApprovalException({ orderId, status: order.status });

      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED, confirmedAt: new Date() } });
      await tx.orderStatusEvent.create({ data: { orderId, fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.CONFIRMED, actorType: "ADMIN", actorId: adminUserId, reason: note?.trim() ? `APPROVED_BY_STAFF: ${note.trim()}` : "APPROVED_BY_STAFF" } });
      await this.logistics.createFulfillmentsForOrders(tx, order.checkoutId, [{ id: order.id, sellerOrganizationId: order.sellerOrganizationId }]);
      await this.sellerFinance.attributeDirectSale(tx, order.id);
      await this.approvalTasks.resolve(approvalTaskKey.order(order.id), "بسته شد: سفارش تأیید و برای فروشنده فرستاده شد.", tx);
      await this.events.publish("OrderApproved", { orderId, checkoutId: order.checkoutId, sellerOrganizationId: order.sellerOrganizationId, userId: order.userId, approvedByUserId: adminUserId }, { tx, aggregateType: "Order", aggregateId: orderId });
      await this.events.publish("OrderConfirmed", { orderId, checkoutId: order.checkoutId }, { tx, aggregateType: "Order", aggregateId: orderId });
    });
  }

  async reject(adminUserId: string, orderId: string, reason: string): Promise<RefundDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true, cancelledAt: true } });
    if (!order) throw new OrderNotFoundException({ orderId });
    if (order.status !== OrderStatus.PENDING || order.cancelledAt) throw new OrderNotAwaitingApprovalException({ orderId, status: order.status });
    const refund = await this.lifecycle.adminCancel(adminUserId, orderId, reason);
    // OrderCancelled already closed it through ApprovalTaskListener; this makes it independent of listener timing.
    await this.approvalTasks.resolve(approvalTaskKey.order(orderId), "بسته شد: سفارش رد و کل مبلغ بازگردانده شد.");
    return refund;
  }
}
