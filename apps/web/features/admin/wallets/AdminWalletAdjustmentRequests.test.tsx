import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminWalletAdjustmentRequestDto, AdminWalletDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminWalletAdjustmentRequestsView, AdminWalletDetailView } from "./AdminWalletViews";

vi.mock("@/services/admin-wallets.service", () => ({
  adminWalletsService: { adjustmentRequests: vi.fn(), approveAdjustment: vi.fn(), rejectAdjustment: vi.fn(), detail: vi.fn(), requestAdjustment: vi.fn() },
}));
vi.mock("@/features/admin/admin-queues", () => ({ refreshQueues: vi.fn(() => Promise.resolve()) }));

function request(overrides: Partial<AdminWalletAdjustmentRequestDto> = {}): AdminWalletAdjustmentRequestDto {
  return {
    id: "req-1",
    userId: "u1",
    userDisplayName: "Mina",
    direction: "CREDIT",
    balanceType: "PURCHASE_ONLY",
    amount: 5_000_000,
    reasonCode: "SERVICE_RECOVERY",
    reason: "Late delivery of order",
    evidenceReference: "SUP-42",
    status: "PENDING",
    requestedBy: { adminUserId: "admin-other", displayName: "Other Admin" },
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    walletAdjustmentId: null,
    walletEntryId: null,
    expiresAt: "2026-11-16T08:00:00.000Z",
    createdAt: "2026-11-13T08:00:00.000Z",
    ...overrides,
  };
}
const theirs = request();
const mine = request({ id: "req-2", direction: "DEBIT", amount: 1_000_000, requestedBy: { adminUserId: "admin-me", displayName: "Me Admin" } });

const detail: AdminWalletDetailDto = {
  user: { id: "u1", displayName: "Mina", email: null, phone: "0912***4567", createdAt: "2026-10-01T08:00:00.000Z" },
  balances: { purchaseOnly: 2_000_000, withdrawable: 0, total: 2_000_000, currency: "IRR" },
  entries: [],
  topUps: [],
  adjustments: [],
  adjustmentRequests: [theirs, mine],
  audit: [],
};

function signIn(permissions: string[]) {
  useAdminStore.setState({ context: { isAdmin: true, adminUserId: "admin-me", displayName: "Me Admin", role: "FINANCE", permissions } as never });
}
const item = (name: RegExp) => screen.findByRole("listitem", { name });

describe("wallet corrections need a second admin (FE-16)", () => {
  beforeEach(() => {
    vi.mocked(adminWalletsService.adjustmentRequests).mockReset().mockResolvedValue({ items: [theirs, mine], total: 2, page: 1, pageSize: 20 });
    vi.mocked(adminWalletsService.approveAdjustment).mockReset().mockResolvedValue({ ...theirs, status: "APPROVED" });
    vi.mocked(adminWalletsService.rejectAdjustment).mockReset().mockResolvedValue({ ...mine, status: "REJECTED" });
    vi.mocked(adminWalletsService.detail).mockReset().mockResolvedValue(detail);
    vi.mocked(adminWalletsService.requestAdjustment).mockReset().mockResolvedValue(theirs);
  });

  it("offers approval only on someone else's request, and approves after a confirmation", async () => {
    signIn(["wallet.view", "wallet.adjust"]);
    renderWithIntl(<AdminWalletAdjustmentRequestsView />, "en");
    expect(adminWalletsService.adjustmentRequests).toHaveBeenCalledWith({ status: "PENDING", page: 1 });

    const own = await item(/by Me Admin/);
    expect(within(own).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(own).getByText("Your request: another admin must approve it.")).toBeTruthy();
    expect(within(own).getByRole("button", { name: "Reject" })).toBeTruthy();

    const other = await item(/by Other Admin/);
    fireEvent.click(within(other).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/for Mina\./)).toBeTruthy();
    expect(within(dialog).getByText(/posts it to the wallet immediately/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and post" }));
    await waitFor(() => expect(adminWalletsService.approveAdjustment).toHaveBeenCalledWith("req-1"));
    expect(await screen.findByText("Approved; the correction was posted to the wallet.")).toBeTruthy();
    // The queue is read again after a decision.
    expect(adminWalletsService.adjustmentRequests).toHaveBeenCalledTimes(2);
  });

  it("rejects only with a written reason, and posts nothing", async () => {
    signIn(["wallet.view", "wallet.adjust"]);
    renderWithIntl(<AdminWalletAdjustmentRequestsView />, "en");
    fireEvent.click(within(await item(/by Me Admin/)).getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await within(dialog).findByText("The reason needs at least 5 characters.")).toBeTruthy();
    expect(adminWalletsService.rejectAdjustment).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason for rejecting (required)"), { target: { value: "Raised twice by mistake" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    await waitFor(() => expect(adminWalletsService.rejectAdjustment).toHaveBeenCalledWith("req-2", "Raised twice by mistake"));
    expect(adminWalletsService.approveAdjustment).not.toHaveBeenCalled();
    expect(await screen.findByText("Rejected; nothing was posted.")).toBeTruthy();
  });

  it.each([
    ["WALLET_ADJUSTMENT_SELF_APPROVAL", "You asked for this correction, so a different admin must approve it."],
    ["WALLET_ADJUSTMENT_REQUEST_EXPIRED", "This request has expired. Ask for a new one if it is still needed."],
    ["INVALID_WALLET_ADJUSTMENT_REQUEST_TRANSITION", "This request was already decided. Reload to see its status."],
  ])("explains an approval the server refused (%s)", async (code, message) => {
    vi.mocked(adminWalletsService.approveAdjustment).mockRejectedValue(new ApiError({ code, message: "refused", requestId: "test" }, 409));
    signIn(["wallet.view", "wallet.adjust"]);
    renderWithIntl(<AdminWalletAdjustmentRequestsView />, "en");
    fireEvent.click(within(await item(/by Other Admin/)).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and post" }));
    expect(await within(dialog).findByText(message)).toBeTruthy();
  });

  it("explains a debit the wallet can no longer cover", async () => {
    vi.mocked(adminWalletsService.approveAdjustment).mockRejectedValue(
      new ApiError({ code: "VALIDATION_ERROR", message: "invalid", requestId: "test", details: { field: "amount", reason: "INSUFFICIENT_WALLET_BALANCE" } }, 400),
    );
    signIn(["wallet.view", "wallet.adjust"]);
    renderWithIntl(<AdminWalletAdjustmentRequestsView />, "en");
    fireEvent.click(within(await item(/by Other Admin/)).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and post" }));
    expect(await within(dialog).findByText("The wallet no longer holds that much in this part, so the debit can't be posted.")).toBeTruthy();
  });

  it("is read-only without wallet.adjust", async () => {
    signIn(["wallet.view"]);
    renderWithIntl(<AdminWalletAdjustmentRequestsView />, "en");
    const other = await item(/by Other Admin/);
    expect(within(other).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(other).queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByText("Deciding on a request needs the “Correct balances” permission.")).toBeTruthy();
  });

  it("sends a correction from the wallet as a request for a second admin", async () => {
    signIn(["wallet.view", "wallet.adjust"]);
    renderWithIntl(<AdminWalletDetailView userId="u1" />, "en");
    expect(await screen.findByRole("heading", { name: "Request adjustment (needs a second admin)" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount (Toman)"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("Explanation (kept in the audit log)"), { target: { value: "Late delivery of order" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/The balance changes only after a second admin approves it\./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, send the request" }));
    await waitFor(() =>
      expect(adminWalletsService.requestAdjustment).toHaveBeenCalledWith(
        "u1",
        { direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "GOODWILL", reason: "Late delivery of order", evidenceReference: undefined },
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Request sent. A second admin must approve it before the balance changes.")).toBeTruthy();

    // The member's open requests sit on the wallet too, with approval hidden on the admin's own.
    expect(screen.getByRole("heading", { name: "Correction requests for this member" })).toBeTruthy();
    expect(within(await item(/by Me Admin/)).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(await item(/by Other Admin/)).getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});
