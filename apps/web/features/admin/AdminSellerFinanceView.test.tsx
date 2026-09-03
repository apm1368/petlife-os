import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSellerFinanceSummaryDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminFinanceService } from "@/services/admin-finance.service";
import { AdminSellerFinanceView } from "./AdminSellerFinanceView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-finance.service", () => ({ adminFinanceService: { listSellerFinance: vi.fn() } }));

function row(overrides: Partial<AdminSellerFinanceSummaryDto> = {}): AdminSellerFinanceSummaryDto {
  return {
    sellerOrganization: { id: "seller-1", name: "Pet Bazaar" } as never,
    account: null,
    balance: { pendingIrr: 4_500_000, availableIrr: 9_000_000, reservedIrr: 0, paidIrr: 20_000_000 },
    ...overrides,
  };
}

function page(items: AdminSellerFinanceSummaryDto[]): PaginatedDto<AdminSellerFinanceSummaryDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("AdminSellerFinanceView", () => {
  beforeEach(() => {
    vi.mocked(adminFinanceService.listSellerFinance).mockReset();
  });

  it("shows a seller's name with its pending and available balances", async () => {
    vi.mocked(adminFinanceService.listSellerFinance).mockResolvedValue(page([row()]));

    renderWithIntl(<AdminSellerFinanceView />);

    await waitFor(() => expect(screen.getByText("Pet Bazaar")).toBeTruthy());
    expect(screen.getByText("Pending: 450,000 Toman")).toBeTruthy();
    expect(screen.getByText("900,000 Toman")).toBeTruthy();
  });

  it("searches by the typed query", async () => {
    vi.mocked(adminFinanceService.listSellerFinance).mockResolvedValue(page([row()]));

    renderWithIntl(<AdminSellerFinanceView />);
    await waitFor(() => expect(screen.getByText("Pet Bazaar")).toBeTruthy());

    const input = screen.getByLabelText("Search seller");
    fireEvent.change(input, { target: { value: "Bazaar" } });
    screen.getByText("Search").click();

    await waitFor(() => expect(adminFinanceService.listSellerFinance).toHaveBeenLastCalledWith("Bazaar", 1, 50));
  });

  it("shows an empty state when no sellers are found", async () => {
    vi.mocked(adminFinanceService.listSellerFinance).mockResolvedValue(page([]));

    renderWithIntl(<AdminSellerFinanceView />);

    await waitFor(() => expect(screen.getByText("No sellers found.")).toBeTruthy());
  });
});
