import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SellerOrderSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerOrdersView } from "./SellerOrdersView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { listOrders: vi.fn() } }));

function page(items: SellerOrderSummaryDto[]): PaginatedDto<SellerOrderSummaryDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("SellerOrdersView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.listOrders).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows a marketplace order and a PET LIFE OS order with distinct source labels", async () => {
    vi.mocked(sellerOsService.listOrders).mockResolvedValue(
      page([
        { orderId: "order-1", source: "TOROB" as never, externalOrderId: "TOROB-123", status: "CONFIRMED" as never, paymentSource: "MARKETPLACE_COLLECTED" as never, fulfillmentStatus: null, itemCount: 1, totalAmount: 300_000, currency: "IRR", createdAt: "2026-01-01T00:00:00.000Z" },
        { orderId: "order-2", source: null, externalOrderId: null, status: "CONFIRMED" as never, paymentSource: "PETLIFE_PAYMENT" as never, fulfillmentStatus: "DELIVERED" as never, itemCount: 2, totalAmount: 600_000, currency: "IRR", createdAt: "2026-01-01T00:00:00.000Z" },
      ]),
    );

    renderWithIntl(<SellerOrdersView />);

    await waitFor(() => expect(screen.getByText("TOROB")).toBeTruthy());
    expect(screen.getByText("PET LIFE OS")).toBeTruthy();
    expect(screen.getByText("TOROB-123", { exact: false })).toBeTruthy();
  });

  it("shows an empty state with no orders", async () => {
    vi.mocked(sellerOsService.listOrders).mockResolvedValue(page([]));

    renderWithIntl(<SellerOrdersView />);

    await waitFor(() => expect(screen.getByText("No orders yet.")).toBeTruthy());
  });
});
