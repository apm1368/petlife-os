import { FulfillmentStatus, OrderRefundRequestStatus, OrderStatus } from "@prisma/client";
import {
  RETURN_WINDOW_HOURS,
  RETURN_WINDOW_MS,
  canCustomerCancel,
  canCustomerRequestRefund,
} from "./order-policy";

/**
 * The return window is a financial boundary: O-04 and O-07 set it at 48 hours from
 * delivery, and FE-11 means a return does not refund the commission — so every extra hour
 * the platform accepts is exposure it carries. These tests pin the boundary exactly, so a
 * later change to a day-based window fails here instead of silently widening it.
 */
describe("order policy — return window (O-04, O-07)", () => {
  const deliveredAt = new Date("2026-11-01T10:00:00.000Z");

  const order = { status: OrderStatus.CONFIRMED, checkoutId: "checkout-1", cancelledAt: null };

  const delivered = (hoursAfterDelivery: number) => ({
    status: FulfillmentStatus.DELIVERED,
    deliveredAt: new Date(deliveredAt.getTime() + hoursAfterDelivery * 3_600_000),
  });

  const noRequests: { status: OrderRefundRequestStatus }[] = [];

  it("states the window as 48 hours, matching O-04 and O-07", () => {
    expect(RETURN_WINDOW_HOURS).toBe(48);
    expect(RETURN_WINDOW_MS).toBe(48 * 3_600_000);
  });

  it("accepts a return request just inside the window", () => {
    expect(canCustomerRequestRefund(order, delivered(47), noRequests, new Date(deliveredAt.getTime() + 47 * 3_600_000))).toBe(true);
  });

  it("accepts a return request exactly at the boundary", () => {
    expect(canCustomerRequestRefund(order, delivered(0), noRequests, new Date(deliveredAt.getTime() + 48 * 3_600_000))).toBe(true);
  });

  it("rejects a return request one hour past the window", () => {
    expect(canCustomerRequestRefund(order, delivered(0), noRequests, new Date(deliveredAt.getTime() + 49 * 3_600_000))).toBe(false);
  });

  it("rejects a return request days after delivery, which a 7-day window would have allowed", () => {
    expect(canCustomerRequestRefund(order, delivered(0), noRequests, new Date(deliveredAt.getTime() + 7 * 86_400_000))).toBe(false);
  });

  it("allows a return request when delivery failed, regardless of the window", () => {
    const failed = { status: FulfillmentStatus.FAILED, deliveredAt: null };
    expect(canCustomerRequestRefund(order, failed, noRequests, new Date(deliveredAt.getTime() + 30 * 86_400_000))).toBe(true);
  });

  it("does not allow a second refund request while one is already open", () => {
    const open = [{ status: OrderRefundRequestStatus.PENDING_REVIEW }];
    expect(canCustomerRequestRefund(order, delivered(1), open, new Date(deliveredAt.getTime() + 2 * 3_600_000))).toBe(false);
  });

  it("does not allow a refund request for a cancelled order", () => {
    const cancelled = { ...order, cancelledAt: new Date(deliveredAt.getTime()) };
    expect(canCustomerRequestRefund(cancelled, delivered(1), noRequests, new Date(deliveredAt.getTime() + 2 * 3_600_000))).toBe(false);
  });
});

describe("order policy — customer cancellation", () => {
  const order = { status: OrderStatus.CONFIRMED, checkoutId: "checkout-1", cancelledAt: null };

  it("allows cancellation while the parcel is still with the seller", () => {
    expect(canCustomerCancel(order, { status: FulfillmentStatus.AWAITING_SELLER_PREPARATION, deliveredAt: null })).toBe(true);
  });

  it("does not allow cancellation after dispatch", () => {
    expect(canCustomerCancel(order, { status: FulfillmentStatus.IN_TRANSIT, deliveredAt: null })).toBe(false);
  });

  it("does not allow cancellation twice", () => {
    const cancelled = { ...order, cancelledAt: new Date() };
    expect(canCustomerCancel(cancelled, null)).toBe(false);
  });

  it("allows cancelling a paid order still waiting for staff approval, but not a refunded one", () => {
    expect(canCustomerCancel({ ...order, status: OrderStatus.PENDING }, null)).toBe(true);
    expect(canCustomerCancel({ ...order, status: OrderStatus.REFUNDED }, null)).toBe(false);
  });
});
