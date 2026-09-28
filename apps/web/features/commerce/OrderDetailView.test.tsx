import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { OrderDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { OrderDetailView } from "./OrderDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({ REFUND_REQUEST_REASONS: ["DAMAGED", "WRONG_ITEM", "OTHER"], commerceService: { getOrder: vi.fn(), cancelOrder: vi.fn(), createRefundRequest: vi.fn(), withdrawRefundRequest: vi.fn(), reviewOrderItem: vi.fn(), getOrderTracking: vi.fn() } }));
vi.mock("@/stores/pet-store", () => ({
  usePetStore: (selector: (state: { pets: { id: string; name: string }[] }) => unknown) => selector({ pets: [{ id: "pet-1", name: "Luna" }] }),
}));

const ORDER: OrderDetailDto = {
  id: "order-1",
  checkoutId: "checkout-1",
  sellerOrganization: { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
  status: "CONFIRMED" as never,
  paymentStatus: "CAPTURED" as never,
  financingStatus: null,
  refunds: [],
  fulfillment: null,
  subtotalAmount: 1_250_000,
  deliveryAmount: 0,
  discountAmount: 0,
  totalAmount: 1_250_000,
  currency: "IRR",
  shippingAddress: {
    id: "address-1",
    householdId: "household-1",
    label: null,
    recipient: null,
    phone: null,
    addressLine: "12 Valiasr St.",
    city: "Tehran",
    region: null,
    countryCode: "IR",
    latitude: null,
    longitude: null,
    instructions: null,
  },
  items: [
    {
      id: "item-1",
      productId: "prod-1",
      productVariantId: "variant-1",
      productTitleSnapshot: "Royal Canin Adult Dog Food",
      variantTitleSnapshot: "2kg",
      skuSnapshot: "RC-DOG-2KG",
      quantity: 1,
      unitPrice: 1_250_000,
      totalPrice: 1_250_000,
      targetPetId: "pet-1",
      compatibilitySnapshot: { status: "COMPATIBLE" as never, reasons: [] },
      listUnitPrice: null,
      unitDiscount: 0,
      promotionName: null,
      reviewId: null,
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:05:00.000Z",
  confirmedAt: "2026-01-01T00:05:00.000Z",
  orderNumber: "PL-1A2B3C4D",
  cancelledAt: null,
  cancelReason: null,
  timeline: [],
  refundRequests: [],
  canCancel: false,
  canRequestRefund: false,
};

describe("OrderDetailView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getOrder).mockReset();
    vi.mocked(commerceService.cancelOrder).mockReset();
    vi.mocked(commerceService.createRefundRequest).mockReset();
    vi.mocked(commerceService.reviewOrderItem).mockReset();
    vi.mocked(commerceService.getOrderTracking).mockReset();
  });

  it("preserves the immutable commercial snapshot: product title, variant, sku-derived price, and target pet", async () => {
    vi.mocked(commerceService.getOrder).mockResolvedValue(ORDER);

    renderWithIntl(<OrderDetailView orderId="order-1" />);

    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());
    expect(screen.getByText("2kg")).toBeTruthy();
    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(screen.getByText("12 Valiasr St.")).toBeTruthy();
    expect(screen.getByText("Fulfillment tracking coming soon")).toBeTruthy();
  });

  it("shows the Fulfillment status, tracking code, and a milestone timeline once a Fulfillment exists", async () => {
    const fulfillment = {
      id: "fulfillment-1",
      orderId: "order-1",
      sellerOrganizationId: "seller-a",
      status: "OUT_FOR_DELIVERY" as never,
      pickupAddress: { recipient: "Pet Bazaar Tehran", phone: null, addressLine: null, city: "Tehran", region: null, countryCode: "IR", instructions: null },
      deliveryAddress: { recipient: "Ali", phone: null, addressLine: "12 Valiasr St.", city: "Tehran", region: null, countryCode: "IR", instructions: null },
      readyAt: "2026-01-01T00:10:00.000Z",
      pickupRequestedAt: "2026-01-01T00:15:00.000Z",
      pickupAssignedAt: "2026-01-01T00:20:00.000Z",
      pickedUpAt: "2026-01-01T00:30:00.000Z",
      outForDeliveryAt: "2026-01-01T01:00:00.000Z",
      deliveredAt: null,
      failedAt: null,
      canceledAt: null,
      failureCode: null,
      failureReason: null,
      createdAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T01:00:00.000Z",
    };
    vi.mocked(commerceService.getOrder).mockResolvedValue({ ...ORDER, fulfillment });
    vi.mocked(commerceService.getOrderTracking).mockResolvedValue({
      fulfillment,
      shipment: {
        id: "shipment-1",
        fulfillmentId: "fulfillment-1",
        provider: "DEV" as never,
        trackingCode: "TRK-ABC12345",
        status: "OUT_FOR_DELIVERY" as never,
        estimatedPickupAt: null,
        estimatedDeliveryAt: "2026-01-01T06:00:00.000Z",
        actualPickupAt: "2026-01-01T00:30:00.000Z",
        actualDeliveryAt: null,
        lastReconciledAt: null,
        createdAt: "2026-01-01T00:15:00.000Z",
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
      timeline: [
        { milestone: "AWAITING_SELLER_PREPARATION" as never, reached: true, occurredAt: "2026-01-01T00:05:00.000Z" },
        { milestone: "OUT_FOR_DELIVERY" as never, reached: true, occurredAt: null },
        { milestone: "DELIVERED" as never, reached: false, occurredAt: null },
      ],
      lastUpdatedAt: "2026-01-01T01:00:00.000Z",
    });

    renderWithIntl(<OrderDetailView orderId="order-1" />);

    await waitFor(() => expect(screen.getAllByText("Out for delivery").length).toBeGreaterThan(0));
    expect(screen.getByText("TRK-ABC12345", { exact: false })).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.queryByText("Fulfillment tracking coming soon")).toBeNull();
  });

  it("shows Payment status and Financing status as separate, never-collapsed badges", async () => {
    vi.mocked(commerceService.getOrder).mockResolvedValue({ ...ORDER, financingStatus: "APPROVED" as never });

    renderWithIntl(<OrderDetailView orderId="order-1" />);

    await waitFor(() => expect(screen.getByText("Payment status")).toBeTruthy());
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Financing status")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("cancel before dispatch: explains the full refund, then shows the cancelled & refunded state", async () => {
    vi.mocked(commerceService.getOrder)
      .mockResolvedValueOnce({ ...ORDER, canCancel: true })
      .mockResolvedValueOnce({ ...ORDER, status: "REFUNDED" as never, cancelledAt: "2026-01-02T00:00:00.000Z", cancelReason: "Wrong size", canCancel: false });
    vi.mocked(commerceService.cancelOrder).mockResolvedValue({ id: "refund-1", status: "SUCCEEDED" } as never);

    renderWithIntl(<OrderDetailView orderId="order-1" />);
    fireEvent.click(await screen.findByText("Cancel order"));
    expect(screen.getByText(/The full amount \(125,000 Toman\) goes back/)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel and refund"));

    await waitFor(() => expect(commerceService.cancelOrder).toHaveBeenCalledWith("order-1", undefined, expect.any(String)));
    expect(await screen.findByText("Order cancelled. Your refund has been issued.")).toBeTruthy();
    expect(screen.getAllByText("Cancelled · refunded").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cancel order")).toBeNull();
  });

  it("after delivery, a refund request goes to review — nothing is refunded instantly", async () => {
    vi.mocked(commerceService.getOrder)
      .mockResolvedValueOnce({ ...ORDER, canRequestRefund: true })
      .mockResolvedValueOnce({ ...ORDER, refundRequests: [{ id: "rr-1", status: "PENDING_REVIEW", reason: "DAMAGED", requestedAmount: 1_250_000, decisionReason: null, createdAt: "2026-01-03T00:00:00.000Z" }] });
    vi.mocked(commerceService.createRefundRequest).mockResolvedValue({} as never);

    renderWithIntl(<OrderDetailView orderId="order-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Request a refund" }));
    fireEvent.click(screen.getByText("Send request"));
    await waitFor(() => expect(commerceService.createRefundRequest).toHaveBeenCalledWith("order-1", { reason: "DAMAGED", description: undefined }, expect.any(String)));
    expect(await screen.findByText("Under review")).toBeTruthy();
    expect(screen.getByText("Withdraw request")).toBeTruthy();
  });

  it("offers one review per delivered item and hides it once reviewed", async () => {
    const delivered = { ...ORDER, fulfillment: { id: "f-1", orderId: "order-1", sequenceNumber: 1, status: "DELIVERED" } as never };
    vi.mocked(commerceService.getOrderTracking).mockResolvedValue({ fulfillment: null, shipment: null, timeline: [], lastUpdatedAt: null } as never);
    vi.mocked(commerceService.getOrder).mockResolvedValueOnce(delivered).mockResolvedValueOnce({ ...delivered, items: [{ ...ORDER.items[0]!, reviewId: "rev-1" }] });
    vi.mocked(commerceService.reviewOrderItem).mockResolvedValue({} as never);

    renderWithIntl(<OrderDetailView orderId="order-1" />);
    fireEvent.click(await screen.findByText("Write a review"));
    const publish = screen.getByText("Publish review").closest("button")!;
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.click(publish);
    await waitFor(() => expect(commerceService.reviewOrderItem).toHaveBeenCalledWith("order-1", "item-1", { rating: 4, body: undefined }));
    expect(await screen.findByText("Thanks — you reviewed this item.")).toBeTruthy();
  });
});
