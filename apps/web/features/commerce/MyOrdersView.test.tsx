import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { OrderSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { MyOrdersView } from "./MyOrdersView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listOrders: vi.fn() } }));

const ORDER: OrderSummaryDto = {
  id: "order-1",
  checkoutId: "checkout-1",
  sellerOrganization: { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
  status: "CONFIRMED" as never,
  paymentStatus: "CAPTURED" as never,
  financingStatus: null,
  refundStatus: null,
  fulfillmentStatus: null,
  itemCount: 2,
  totalAmount: 1_250_000,
  currency: "IRR",
  createdAt: "2026-01-01T00:00:00.000Z",
  confirmedAt: "2026-01-01T00:05:00.000Z",
};

describe("MyOrdersView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.listOrders).mockReset();
  });

  it("shows each Order's seller, item count, status, and total", async () => {
    vi.mocked(commerceService.listOrders).mockResolvedValue([ORDER]);

    renderWithIntl(<MyOrdersView />);

    await waitFor(() => expect(screen.getByText("Pet Bazaar Tehran")).toBeTruthy());
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();
    expect(screen.getByText("125,000 Toman")).toBeTruthy();
  });

  it("shows the Fulfillment status as its own separate badge, never collapsed into Order status", async () => {
    vi.mocked(commerceService.listOrders).mockResolvedValue([{ ...ORDER, fulfillmentStatus: "OUT_FOR_DELIVERY" as never }]);

    renderWithIntl(<MyOrdersView />);

    await waitFor(() => expect(screen.getByText("Out for delivery")).toBeTruthy());
    expect(screen.getByText("Confirmed")).toBeTruthy();
  });

  it("shows an empty state with no orders yet", async () => {
    vi.mocked(commerceService.listOrders).mockResolvedValue([]);

    renderWithIntl(<MyOrdersView />);

    await waitFor(() => expect(screen.getByText("You haven't placed any orders yet.")).toBeTruthy());
  });
});
