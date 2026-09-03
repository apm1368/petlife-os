import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSellerFinanceSummaryDto, SellerAdjustmentDto, SellerSettlementDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminFinanceService } from "@/services/admin-finance.service";
import { AdminSellerFinanceDetailView } from "./AdminSellerFinanceDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-finance.service", () => ({
  adminFinanceService: { getSellerFinance: vi.fn(), listSettlements: vi.fn(), listAdjustments: vi.fn(), calculateSettlement: vi.fn(), createAdjustment: vi.fn() },
}));

const SUMMARY: AdminSellerFinanceSummaryDto = {
  sellerOrganization: { id: "seller-1", name: "Pet Bazaar" } as never,
  account: null,
  balance: { pendingIrr: 4_500_000, availableIrr: 9_000_000, reservedIrr: 0, paidIrr: 20_000_000 },
};

const SETTLEMENT: SellerSettlementDto = {
  id: "settle-1",
  reference: "STL-000001",
  sellerOrganizationId: "seller-1",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-14T00:00:00.000Z",
  currency: "IRR",
  status: "PAID" as never,
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
  paidAt: "2026-01-15T00:00:00.000Z",
  reconciledAt: null,
  cancelledAt: null,
};

const ADJUSTMENT: SellerAdjustmentDto = {
  id: "adj-1",
  sellerOrganizationId: "seller-1",
  type: "CREDIT" as never,
  reasonCode: "MANUAL_CREDIT" as never,
  amountIrr: 200_000,
  reason: "Goodwill credit",
  evidenceReference: null,
  createdByAdmin: { id: "admin-1", displayName: "Finance Admin", role: "FINANCE" as never },
  createdAt: "2026-01-10T00:00:00.000Z",
};

describe("AdminSellerFinanceDetailView", () => {
  beforeEach(() => {
    vi.mocked(adminFinanceService.getSellerFinance).mockReset();
    vi.mocked(adminFinanceService.listSettlements).mockReset();
    vi.mocked(adminFinanceService.listAdjustments).mockReset();
    vi.mocked(adminFinanceService.calculateSettlement).mockReset();
    vi.mocked(adminFinanceService.createAdjustment).mockReset();
    vi.mocked(adminFinanceService.getSellerFinance).mockResolvedValue(SUMMARY);
    vi.mocked(adminFinanceService.listSettlements).mockResolvedValue([SETTLEMENT]);
    vi.mocked(adminFinanceService.listAdjustments).mockResolvedValue([ADJUSTMENT]);
  });

  it("shows the seller's balance tiles, its settlements, and its adjustments", async () => {
    renderWithIntl(<AdminSellerFinanceDetailView sellerId="seller-1" />);

    await waitFor(() => expect(screen.getByText("Pet Bazaar")).toBeTruthy());
    expect(screen.getByText("450,000 Toman")).toBeTruthy();
    expect(screen.getByText("STL-000001")).toBeTruthy();
    expect(screen.getByText("Goodwill credit")).toBeTruthy();
    expect(screen.getByText("+20,000 Toman")).toBeTruthy();
  });

  it("creates an adjustment and reloads the adjustment list", async () => {
    vi.mocked(adminFinanceService.createAdjustment).mockResolvedValue(ADJUSTMENT);

    renderWithIntl(<AdminSellerFinanceDetailView sellerId="seller-1" />);
    await waitFor(() => expect(screen.getByText("Pet Bazaar")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Amount (IRR)"), { target: { value: "200000" } });
    // "Reason" labels both the reason-code <select> and the free-text reason <input>; the input is the one after it.
    const reasonInput = screen.getAllByLabelText("Reason").find((el) => el.tagName === "INPUT")!;
    fireEvent.change(reasonInput, { target: { value: "Goodwill credit" } });
    screen.getByText("Add adjustment").click();

    await waitFor(() =>
      expect(adminFinanceService.createAdjustment).toHaveBeenCalledWith("seller-1", { type: "CREDIT", reasonCode: "MANUAL_CREDIT", amountIrr: 200_000, reason: "Goodwill credit" }),
    );
  });

  it("shows an error state when the seller finance summary fails to load", async () => {
    vi.mocked(adminFinanceService.getSellerFinance).mockRejectedValue(new Error("not found"));

    renderWithIntl(<AdminSellerFinanceDetailView sellerId="missing" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
