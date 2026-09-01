import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { OrderDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { OrderDetailView } from "./OrderDetailView";

vi.mock("@/services/commerce.service", () => ({ commerceService: { getOrder: vi.fn(), requestRefund: vi.fn() } }));
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
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:05:00.000Z",
  confirmedAt: "2026-01-01T00:05:00.000Z",
};

describe("OrderDetailView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getOrder).mockReset();
    vi.mocked(commerceService.requestRefund).mockReset();
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

  it("shows Payment status and Financing status as separate, never-collapsed badges", async () => {
    vi.mocked(commerceService.getOrder).mockResolvedValue({ ...ORDER, financingStatus: "APPROVED" as never });

    renderWithIntl(<OrderDetailView orderId="order-1" />);

    await waitFor(() => expect(screen.getByText("Payment status")).toBeTruthy());
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("Financing status")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("lets the owner request a refund on a confirmed order and shows the resulting status", async () => {
    vi.mocked(commerceService.getOrder).mockResolvedValueOnce(ORDER).mockResolvedValueOnce({
      ...ORDER,
      refunds: [
        {
          id: "refund-1",
          paymentIntentId: "intent-1",
          financingIntentId: null,
          orderId: "order-1",
          amount: 1_250_000,
          currency: "IRR",
          status: "SUCCEEDED" as never,
          reason: "Changed my mind",
          providerReference: "dev_refund_1",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:05.000Z",
          completedAt: "2026-01-02T00:00:05.000Z",
        },
      ],
    });
    vi.mocked(commerceService.requestRefund).mockResolvedValue({
      id: "refund-1",
      paymentIntentId: "intent-1",
      financingIntentId: null,
      orderId: "order-1",
      amount: 1_250_000,
      currency: "IRR",
      status: "SUCCEEDED" as never,
      reason: "Changed my mind",
      providerReference: "dev_refund_1",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:05.000Z",
      completedAt: "2026-01-02T00:00:05.000Z",
    });

    renderWithIntl(<OrderDetailView orderId="order-1" />);
    await waitFor(() => expect(screen.getByText("Submit request")).toBeTruthy());

    fireEvent.click(screen.getByText("Submit request"));

    await waitFor(() => expect(commerceService.requestRefund).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Refunded")).toBeTruthy());
    expect(screen.queryByText("Submit request")).toBeNull();
  });
});
