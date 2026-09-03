import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SellerTransactionDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerFinanceService } from "@/services/seller-finance.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerTransactionsView } from "./SellerTransactionsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-finance.service", () => ({ sellerFinanceService: { listTransactions: vi.fn() } }));

function page(items: SellerTransactionDto[], total = items.length): PaginatedDto<SellerTransactionDto> {
  return { items, total, page: 1, pageSize: 25 };
}

const SALE_ROW: SellerTransactionDto = {
  id: "txn-1",
  referenceType: "ORDER_SALE",
  referenceId: "order-1",
  description: "Order sale — order-1",
  breakdown: {
    id: "bd-1",
    orderId: "order-1",
    sellerOrganizationId: "seller-1",
    origin: "PETLIFE" as never,
    grossMerchandiseIrr: 5_000_000,
    shippingIrr: 0,
    discountIrr: 0,
    shippingResponsibility: "PLATFORM" as never,
    commissionBasisPoints: 1000,
    platformCommissionIrr: 500_000,
    channelFeeIrr: 0,
    channelFeeConfidence: "EXACT" as never,
    sellerGrossIrr: 5_000_000,
    sellerNetIrr: 4_500_000,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  netAmountIrr: 4_500_000,
  settlementId: null,
  settlementStatus: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("SellerTransactionsView", () => {
  beforeEach(() => {
    vi.mocked(sellerFinanceService.listTransactions).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows a sale row with its gross/commission breakdown and an unsettled status", async () => {
    vi.mocked(sellerFinanceService.listTransactions).mockResolvedValue(page([SALE_ROW]));

    renderWithIntl(<SellerTransactionsView />);

    await waitFor(() => expect(screen.getByText("Order sale — order-1")).toBeTruthy());
    expect(screen.getByText("Gross: 500,000 Toman")).toBeTruthy();
    expect(screen.getByText("Commission: 50,000 Toman")).toBeTruthy();
    expect(screen.getByText("Unsettled")).toBeTruthy();
  });

  it("shows a Load more button when more pages exist and fetches the next page", async () => {
    vi.mocked(sellerFinanceService.listTransactions).mockResolvedValue(page([SALE_ROW], 50));

    renderWithIntl(<SellerTransactionsView />);

    await waitFor(() => expect(screen.getByText("Load more")).toBeTruthy());
    screen.getByText("Load more").click();

    await waitFor(() => expect(sellerFinanceService.listTransactions).toHaveBeenCalledWith("seller-1", { page: 2, pageSize: 25 }));
  });

  it("shows an empty state with no transactions", async () => {
    vi.mocked(sellerFinanceService.listTransactions).mockResolvedValue(page([]));

    renderWithIntl(<SellerTransactionsView />);

    await waitFor(() => expect(screen.getByText("No transactions yet.")).toBeTruthy());
  });
});
