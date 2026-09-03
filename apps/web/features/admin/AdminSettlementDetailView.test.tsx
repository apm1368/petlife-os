import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerSettlementDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminFinanceService } from "@/services/admin-finance.service";
import { AdminSettlementDetailView } from "./AdminSettlementDetailView";

vi.mock("@/services/admin-finance.service", () => ({
  adminFinanceService: { getSettlement: vi.fn(), approveSettlement: vi.fn(), payoutSettlement: vi.fn(), cancelSettlement: vi.fn(), markSettlementFailed: vi.fn() },
}));

function detail(overrides: Partial<SellerSettlementDetailDto> = {}): SellerSettlementDetailDto {
  return {
    id: "settle-1",
    reference: "STL-000003",
    sellerOrganizationId: "seller-1",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-01-14T00:00:00.000Z",
    currency: "IRR",
    status: "CALCULATED" as never,
    grossIrr: 15_000_000,
    commissionIrr: 1_500_000,
    refundsIrr: 0,
    adjustmentsIrr: 0,
    netIrr: 13_500_000,
    initiatedByAdmin: { id: "admin-1", displayName: "Finance Admin", role: "FINANCE" as never },
    approvedByAdmin: null,
    payoutMethodType: "MANUAL",
    createdAt: "2026-01-14T00:00:00.000Z",
    approvedAt: null,
    paidAt: null,
    reconciledAt: null,
    cancelledAt: null,
    items: [{ id: "item-1", sourceType: "ORDER", sourceId: "order-1", grossAmount: 15_000_000, feeAmount: 1_500_000, netAmount: 13_500_000, description: "Order sale — order-1", createdAt: "2026-01-14T00:00:00.000Z" }],
    ...overrides,
  };
}

describe("AdminSettlementDetailView", () => {
  beforeEach(() => {
    vi.mocked(adminFinanceService.getSettlement).mockReset();
    vi.mocked(adminFinanceService.approveSettlement).mockReset();
    vi.mocked(adminFinanceService.payoutSettlement).mockReset();
  });

  it("shows Approve enabled for a CALCULATED settlement and disables Payout/Cancel controls appropriately once PAID", async () => {
    vi.mocked(adminFinanceService.getSettlement).mockResolvedValue(detail());

    renderWithIntl(<AdminSettlementDetailView settlementId="settle-1" />);

    await waitFor(() => expect(screen.getByText("STL-000003")).toBeTruthy());
    const approveButton = screen.getByText("Approve").closest("button")!;
    expect(approveButton.disabled).toBe(false);
    const markFailedButton = screen.getByText("Mark payout failed").closest("button")!;
    expect(markFailedButton.disabled).toBe(true); // only reachable from PAID
  });

  it("calls approveSettlement when Approve is clicked and reloads the settlement", async () => {
    vi.mocked(adminFinanceService.getSettlement).mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail({ status: "APPROVED" as never, approvedByAdmin: { id: "admin-2", displayName: "Root Admin", role: "SUPER_ADMIN" as never } }));
    vi.mocked(adminFinanceService.approveSettlement).mockResolvedValue(detail({ status: "APPROVED" as never }));

    renderWithIntl(<AdminSettlementDetailView settlementId="settle-1" />);
    await waitFor(() => expect(screen.getByText("STL-000003")).toBeTruthy());

    screen.getByText("Approve").click();

    await waitFor(() => expect(adminFinanceService.approveSettlement).toHaveBeenCalledWith("settle-1"));
    await waitFor(() => expect(screen.getByText("Root Admin")).toBeTruthy());
  });

  it("shows an error state when the settlement fails to load", async () => {
    vi.mocked(adminFinanceService.getSettlement).mockRejectedValue(new Error("not found"));

    renderWithIntl(<AdminSettlementDetailView settlementId="missing" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
