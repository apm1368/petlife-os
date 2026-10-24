import { FulfillmentStatus, OrderRefundRequestStatus, OrderStatus } from "@prisma/client";

/**
 * Customer self-service policy for commerce orders (Batch 4).
 *
 * - Cancel: allowed while the parcel has not been handed to a courier —
 *   the fulfillment is still with the seller (PENDING,
 *   AWAITING_SELLER_PREPARATION, READY_FOR_PICKUP). Cancelling refunds the
 *   full order total immediately through the gateway and restocks.
 * - After dispatch the customer can no longer cancel. Once delivered (within
 *   RETURN_WINDOW_DAYS) or when delivery failed, they may open a refund
 *   *request*, which a finance admin reviews. Nothing is refunded
 *   automatically after dispatch.
 */
export const CUSTOMER_CANCELLABLE_FULFILLMENT: ReadonlySet<FulfillmentStatus> = new Set([
  FulfillmentStatus.PENDING,
  FulfillmentStatus.AWAITING_SELLER_PREPARATION,
  FulfillmentStatus.READY_FOR_PICKUP,
]);

export const RETURN_WINDOW_DAYS = 7;

export interface PolicyOrder {
  status: OrderStatus;
  checkoutId: string | null;
  cancelledAt: Date | null;
}

export interface PolicyFulfillment {
  status: FulfillmentStatus;
  deliveredAt: Date | null;
}

export function canCustomerCancel(order: PolicyOrder, fulfillment: PolicyFulfillment | null): boolean {
  if (!order.checkoutId || order.cancelledAt) return false;
  if (order.status !== OrderStatus.CONFIRMED) return false;
  return !fulfillment || CUSTOMER_CANCELLABLE_FULFILLMENT.has(fulfillment.status);
}

export function canCustomerRequestRefund(
  order: PolicyOrder,
  fulfillment: PolicyFulfillment | null,
  refundRequests: { status: OrderRefundRequestStatus }[],
  now: Date = new Date(),
): boolean {
  if (!order.checkoutId || order.cancelledAt) return false;
  if (order.status !== OrderStatus.CONFIRMED || !fulfillment) return false;
  if (refundRequests.some((r) => r.status === OrderRefundRequestStatus.PENDING_REVIEW || r.status === OrderRefundRequestStatus.APPROVED)) return false;
  if (fulfillment.status === FulfillmentStatus.FAILED) return true;
  if (fulfillment.status !== FulfillmentStatus.DELIVERED) return false;
  const deliveredAt = fulfillment.deliveredAt ?? now;
  return now.getTime() - deliveredAt.getTime() <= RETURN_WINDOW_DAYS * 86_400_000;
}
