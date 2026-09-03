import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerFinanceSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerFinanceView } from "./SellerFinanceView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-finance.service", () => ({ sellerFinanceService: { getSummary: vi.fn() } }));

const SUMMARY: SellerFinanceSummaryDto = {
  account: { id: "acct-1", sellerOrganizationId: "seller-1", currency: "IRR", status: "ACTIVE" as never, settlementSchedule: "MANUAL" as never, payoutMethodType: "MANUAL", payoutReferenceMasked: null, minimumPayoutIrr: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  balance: { pendingIrr: 4_500_000, availableIrr: 0, reservedIrr: 0, paidIrr: 9_000_000 },
  nextSettlementEligibleIrr: 2_200_000,
  lastSettlement: {
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
    approvedByAdmin: { id: "admin-2", displayName: "Root Admin", role: "SUPER_ADMIN" as never },
    payoutMethodType: "MANUAL",
    createdAt: "2026-01-14T00:00:00.000Z",
    approvedAt: "2026-01-14T00:00:00.000Z",
    paidAt: "2026-01-15T00:00:00.000Z",
    reconciledAt: null,
    cancelledAt: null,
  },
};

describe("SellerFinanceView", () => {
  beforeEach(() => {
    vi.mocked(sellerFinanceService.getSummary).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows balance tiles in Toman and the last settlement's reference", async () => {
    vi.mocked(sellerFinanceService.getSummary).mockResolvedValue(SUMMARY);

    renderWithIntl(<SellerFinanceView />);

    await waitFor(() => expect(screen.getByText("STL-000001")).toBeTruthy());
    expect(screen.getByText("450,000 Toman")).toBeTruthy();
    expect(screen.getByText("1,350,000 Toman")).toBeTruthy();
  });

  it("shows a no-settlements state when the seller has never been settled", async () => {
    vi.mocked(sellerFinanceService.getSummary).mockResolvedValue({ ...SUMMARY, lastSettlement: null });

    renderWithIntl(<SellerFinanceView />);

    await waitFor(() => expect(screen.getByText("No settlements yet.")).toBeTruthy());
  });

  it("shows an error state with a retry action when the summary fails to load", async () => {
    vi.mocked(sellerFinanceService.getSummary).mockRejectedValue(new Error("network error"));

    renderWithIntl(<SellerFinanceView />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(sellerFinanceService.getSummary).mockResolvedValue(SUMMARY);

    renderWithIntl(<SellerFinanceView />, "fa");

    await waitFor(() => expect(screen.getByText("امور مالی")).toBeTruthy());
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
  });
});
