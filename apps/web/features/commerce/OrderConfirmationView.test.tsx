import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { OrderDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { OrderConfirmationView } from "./OrderConfirmationView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { getOrder: vi.fn() } }));

function order(id: string, sellerName: string): OrderDetailDto {
  return {
    id,
    checkoutId: "checkout-1",
    sellerOrganization: { id: `seller-${id}`, name: sellerName, verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
    status: "CONFIRMED" as never,
    paymentStatus: "CAPTURED" as never,
    financingStatus: null,
    refunds: [],
    fulfillment: null,
    subtotalAmount: 500_000,
    deliveryAmount: 0,
    discountAmount: 0,
    totalAmount: 500_000,
    currency: "IRR",
    shippingAddress: null,
    items: [
      {
        id: `${id}-item`,
        productId: "prod-1",
        productVariantId: "variant-1",
        productTitleSnapshot: "Grain-Free Training Treats",
        variantTitleSnapshot: "200g",
        skuSnapshot: "TREAT-200G",
        quantity: 1,
        unitPrice: 500_000,
        totalPrice: 500_000,
        targetPetId: null,
        compatibilitySnapshot: null,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:05.000Z",
  };
}

describe("OrderConfirmationView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getOrder).mockReset();
  });

  it("shows each seller's Order as its own separate block for a multi-seller checkout", async () => {
    vi.mocked(commerceService.getOrder).mockImplementation((id: string) =>
      Promise.resolve(id === "order-1" ? order("order-1", "Pet Bazaar Tehran") : order("order-2", "Golestan Pet Supplies")),
    );

    renderWithIntl(<OrderConfirmationView orderIds={["order-1", "order-2"]} />);

    await waitFor(() => expect(screen.getByText("Pet Bazaar Tehran")).toBeTruthy());
    expect(screen.getByText("Golestan Pet Supplies")).toBeTruthy();
    expect(screen.getAllByText("Confirmed")).toHaveLength(2);
  });

  it("shows the delivery amount and a non-alarming fulfillment status, never implying courier assignment before it exists", async () => {
    vi.mocked(commerceService.getOrder).mockResolvedValue({
      ...order("order-1", "Pet Bazaar Tehran"),
      deliveryAmount: 350_000,
      fulfillment: {
        id: "fulfillment-1",
        orderId: "order-1",
        sellerOrganizationId: "seller-order-1",
        status: "AWAITING_SELLER_PREPARATION" as never,
        pickupAddress: { recipient: "Pet Bazaar Tehran", phone: null, addressLine: null, city: "Tehran", region: null, countryCode: "IR", instructions: null },
        deliveryAddress: { recipient: "Ali", phone: null, addressLine: "12 Valiasr St.", city: "Tehran", region: null, countryCode: "IR", instructions: null },
        readyAt: null,
        pickupRequestedAt: null,
        pickupAssignedAt: null,
        pickedUpAt: null,
        outForDeliveryAt: null,
        deliveredAt: null,
        failedAt: null,
        canceledAt: null,
        failureCode: null,
        failureReason: null,
        createdAt: "2026-01-01T00:00:05.000Z",
        updatedAt: "2026-01-01T00:00:05.000Z",
      },
    });

    renderWithIntl(<OrderConfirmationView orderIds={["order-1"]} />);

    await waitFor(() => expect(screen.getByText("Seller is preparing your order")).toBeTruthy());
    expect(screen.queryByText(/courier/i)).toBeNull();
  });
});
