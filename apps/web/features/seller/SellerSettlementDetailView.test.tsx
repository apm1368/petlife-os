import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerSettlementDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerSettlementDetailView } from "./SellerSettlementDetailView";

vi.mock("@/services/seller-finance.service", () => ({ sellerFinanceService: { getSettlement: vi.fn() } }));

const DETAIL: SellerSettlementDetailDto = {
  id: "settle-1",
  reference: "STL-000002",
  sellerOrganizationId: "seller-1",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-14T00:00:00.000Z",
  currency: "IRR",
  status: "PAID" as never,
  grossIrr: 8_000_000,
  commissionIrr: 800_000,
  refundsIrr: 0,
  adjustmentsIrr: 0,
  netIrr: 7_200_000,
  initiatedByAdmin: { id: "admin-1", displayName: "Finance Admin", role: "FINANCE" as never },
  approvedByAdmin: null,
  payoutMethodType: "MANUAL",
  createdAt: "2026-01-14T00:00:00.000Z",
  approvedAt: null,
  paidAt: "2026-01-15T00:00:00.000Z",
  reconciledAt: null,
  cancelledAt: null,
  items: [{ id: "item-1", sourceType: "ORDER", sourceId: "order-1", grossAmount: 8_000_000, feeAmount: 800_000, netAmount: 7_200_000, description: "Order sale — order-1", createdAt: "2026-01-14T00:00:00.000Z" }],
};

describe("SellerSettlementDetailView", () => {
  beforeEach(() => {
    vi.mocked(sellerFinanceService.getSettlement).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows the full gross/commission/net breakdown and its line items", async () => {
    vi.mocked(sellerFinanceService.getSettlement).mockResolvedValue(DETAIL);

    renderWithIntl(<SellerSettlementDetailView settlementId="settle-1" />);

    await waitFor(() => expect(screen.getByText("STL-000002")).toBeTruthy());
    expect(screen.getByText("800,000 Toman")).toBeTruthy(); // gross
    expect(screen.getByText("-80,000 Toman")).toBeTruthy(); // commission, shown as a deduction
    // "720,000 Toman" appears twice: the settlement's own net payout figure, and this single item's net amount.
    expect(screen.getAllByText("720,000 Toman").length).toBe(2);
    expect(screen.getByText("Order sale — order-1")).toBeTruthy();
  });

  it("shows an error state when the settlement fails to load (e.g. another seller's id)", async () => {
    vi.mocked(sellerFinanceService.getSettlement).mockRejectedValue(new Error("not found"));

    renderWithIntl(<SellerSettlementDetailView settlementId="foreign-settlement" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
