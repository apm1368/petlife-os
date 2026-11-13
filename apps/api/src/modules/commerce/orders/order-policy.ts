import { FulfillmentStatus, OrderRefundRequestStatus, OrderStatus } from "@prisma/client";

/**
 * Customer self-service policy for commerce orders (Batch 4).
 *
 * - Cancel: allowed while an order waits for staff approval (PENDING, no
 *   fulfillment yet) and while the parcel has not been handed to a courier —
 *   the fulfillment is still with the seller (PENDING,
 *   AWAITING_SELLER_PREPARATION, READY_FOR_PICKUP). Cancelling refunds the
 *   full order total immediately through the gateway and restocks.
 * - After dispatch the customer can no longer cancel. Once delivered (within
 *   RETURN_WINDOW_HOURS) or when delivery failed, they may open a refund
 *   *request*, which a finance admin reviews. Nothing is refunded
 *   automatically after dispatch.
 */
export const CUSTOMER_CANCELLABLE_FULFILLMENT: ReadonlySet<FulfillmentStatus> = new Set([
  FulfillmentStatus.PENDING,
  FulfillmentStatus.AWAITING_SELLER_PREPARATION,
  FulfillmentStatus.READY_FOR_PICKUP,
]);

/**
 * The return window is 48 hours from delivery, not a number of days.
 *
 * O-04: delivery is confirmed 3 days after dispatch is recorded, and it "starts the 48-hour
 * return clock"; O-07: a return is accepted within 48 hours of delivery for damage,
 * mismatch, or expiry. The earlier 7-day value in this file contradicted both, and a wider
 * window means the platform carries more refund exposure (FE-11: commission is not returned
 * on a return). The window is measured in hours so the boundary is exactly 48 hours.
 */
export const RETURN_WINDOW_HOURS = 48;

export const RETURN_WINDOW_MS = RETURN_WINDOW_HOURS * 3_600_000;

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
  // PENDING = paid and held for staff approval (approval modes): nothing has reached the seller yet.
  if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PENDING) return false;
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
  return now.getTime() - deliveredAt.getTime() <= RETURN_WINDOW_MS;
}
