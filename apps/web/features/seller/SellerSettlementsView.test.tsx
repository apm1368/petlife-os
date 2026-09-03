import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerSettlementDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerSettlementsView } from "./SellerSettlementsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-finance.service", () => ({ sellerFinanceService: { listSettlements: vi.fn() } }));

function settlement(overrides: Partial<SellerSettlementDto> = {}): SellerSettlementDto {
  return {
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
    ...overrides,
  };
}

describe("SellerSettlementsView", () => {
  beforeEach(() => {
    vi.mocked(sellerFinanceService.listSettlements).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows a settlement's reference, status, and net payout amount", async () => {
    vi.mocked(sellerFinanceService.listSettlements).mockResolvedValue([settlement()]);

    renderWithIntl(<SellerSettlementsView />);

    await waitFor(() => expect(screen.getByText("STL-000001")).toBeTruthy());
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText("1,350,000 Toman")).toBeTruthy();
  });

  it("shows an empty state with no settlements", async () => {
    vi.mocked(sellerFinanceService.listSettlements).mockResolvedValue([]);

    renderWithIntl(<SellerSettlementsView />);

    await waitFor(() => expect(screen.getByText("No settlements yet.")).toBeTruthy());
  });

  it("shows an error state with a retry action when settlements fail to load", async () => {
    vi.mocked(sellerFinanceService.listSettlements).mockRejectedValue(new Error("network error"));

    renderWithIntl(<SellerSettlementsView />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
