import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminCardTransferPaymentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminCardReceiptsView } from "./AdminCardReceiptsView";

vi.mock("@/services/admin-wallets.service", () => ({ adminWalletsService: { cardReceipts: vi.fn(), cardReceiptLink: vi.fn(), reviewCardReceipt: vi.fn() } }));

const row: AdminCardTransferPaymentDto = {
  id: "ctp-1",
  status: "REVIEW_PENDING",
  member: { userId: "u1", displayName: "Mina" },
  reference: { kind: "BOOKING", bookingId: "b1", orderIds: [] },
  expectedAmount: 5_000_000,
  receivedAmount: null,
  currency: "IRR",
  companyCardNumberMasked: "••••••••••••7890",
  accountHolderName: "PET LIFE OS",
  receiptUploaded: true,
  receiptUploadedAt: "2026-11-12T08:00:00.000Z",
  reviewAvailableAt: "2026-11-12T08:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  createdAt: "2026-11-12T07:50:00.000Z",
};

describe("AdminCardReceiptsView", () => {
  beforeEach(() => {
    vi.mocked(adminWalletsService.cardReceipts).mockReset().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 });
    vi.mocked(adminWalletsService.reviewCardReceipt).mockReset().mockResolvedValue({ id: "ctp-1", status: "REJECTED" });
    vi.mocked(adminWalletsService.cardReceiptLink).mockReset().mockResolvedValue({ downloadUrl: "https://files.example/receipt", expiresInSeconds: 300 });
  });

  it("opens pending receipts first and rejects only with a reason", async () => {
    useAdminStore.setState({ context: { permissions: ["finance.view", "finance.refund.execute"] } as never });
    renderWithIntl(<AdminCardReceiptsView />, "en");
    expect(adminWalletsService.cardReceipts).toHaveBeenCalledWith("REVIEW_PENDING", 1);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(within(dialog).getByRole("button", { name: "View the receipt" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.example/receipt", "_blank", "noopener,noreferrer"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await within(dialog).findByText("To reject, write a reason of at least 5 characters.")).toBeTruthy();
    expect(adminWalletsService.reviewCardReceipt).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason (required to reject)"), { target: { value: "Amount does not match" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(adminWalletsService.reviewCardReceipt).toHaveBeenCalledWith("ctp-1", { approve: false, receivedAmount: 5_000_000, reason: "Amount does not match" }));
    expect(await screen.findByText("Rejected; the member was notified.")).toBeTruthy();
  });

  it("approves for the amount received, in toman", async () => {
    vi.mocked(adminWalletsService.reviewCardReceipt).mockResolvedValue({ id: "ctp-1", status: "APPROVED" });
    useAdminStore.setState({ context: { permissions: ["finance.view", "finance.refund.execute"] } as never });
    renderWithIntl(<AdminCardReceiptsView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount received (toman)"), { target: { value: "۵۰۰۰۰۰" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(adminWalletsService.reviewCardReceipt).toHaveBeenCalledWith("ctp-1", { approve: true, receivedAmount: 5_000_000 }));
  });

  it("is read-only without finance.refund.execute", async () => {
    useAdminStore.setState({ context: { permissions: ["finance.view"] } as never });
    renderWithIntl(<AdminCardReceiptsView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(dialog).getByText(/Only finance.refund.execute/)).toBeTruthy();
  });
});
