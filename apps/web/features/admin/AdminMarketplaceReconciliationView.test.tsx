import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MarketplaceSettlementReconciliationResultDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminFinanceService } from "@/services/admin-finance.service";
import { AdminMarketplaceReconciliationView } from "./AdminMarketplaceReconciliationView";

vi.mock("@/services/admin-finance.service", () => ({
  adminFinanceService: { listReconciliation: vi.fn(), resolveReconciliation: vi.fn(), importMarketplaceSettlement: vi.fn() },
}));

const MATCHED: MarketplaceSettlementReconciliationResultDto = {
  id: "recon-1",
  marketplaceSettlementStatementId: "stmt-1",
  marketplaceSettlementStatementLineId: "line-1",
  marketplaceOrderId: "mp-order-1",
  status: "MATCHED" as never,
  expectedAmount: 4_000_000,
  statementAmount: 4_000_000,
  variance: 0,
  notes: null,
  resolvedByAdmin: null,
  resolvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MISMATCH: MarketplaceSettlementReconciliationResultDto = {
  ...MATCHED,
  id: "recon-2",
  status: "MISMATCH" as never,
  statementAmount: 3_700_000,
  variance: -300_000,
};

describe("AdminMarketplaceReconciliationView", () => {
  beforeEach(() => {
    vi.mocked(adminFinanceService.listReconciliation).mockReset();
    vi.mocked(adminFinanceService.resolveReconciliation).mockReset();
  });

  it("shows both a MATCHED and a MISMATCH finding with the correct variance", async () => {
    vi.mocked(adminFinanceService.listReconciliation).mockResolvedValue([MATCHED, MISMATCH]);

    renderWithIntl(<AdminMarketplaceReconciliationView />);

    await waitFor(() => expect(screen.getByText("MATCHED")).toBeTruthy());
    expect(screen.getByText("MISMATCH")).toBeTruthy();
    expect(screen.getByText("Variance: -30,000 Toman")).toBeTruthy();
  });

  it("resolves a mismatch after entering notes", async () => {
    vi.mocked(adminFinanceService.listReconciliation).mockResolvedValueOnce([MISMATCH]).mockResolvedValueOnce([{ ...MISMATCH, resolvedAt: "2026-01-02T00:00:00.000Z", notes: "Confirmed with marketplace." }]);
    vi.mocked(adminFinanceService.resolveReconciliation).mockResolvedValue({ ...MISMATCH, resolvedAt: "2026-01-02T00:00:00.000Z" });

    renderWithIntl(<AdminMarketplaceReconciliationView />);
    await waitFor(() => expect(screen.getByText("MISMATCH")).toBeTruthy());

    screen.getByText("Resolve").click();
    const notesInput = await screen.findByLabelText("Resolution notes");
    fireEvent.change(notesInput, { target: { value: "Confirmed with marketplace." } });
    screen.getByText("Submit").click();

    await waitFor(() => expect(adminFinanceService.resolveReconciliation).toHaveBeenCalledWith("recon-2", "Confirmed with marketplace."));
  });

  it("shows an empty state when there are no findings", async () => {
    vi.mocked(adminFinanceService.listReconciliation).mockResolvedValue([]);

    renderWithIntl(<AdminMarketplaceReconciliationView />);

    await waitFor(() => expect(screen.getByText("No reconciliation findings yet.")).toBeTruthy());
  });
});
