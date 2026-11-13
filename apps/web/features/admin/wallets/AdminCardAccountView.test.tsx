import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminCardTransferDestinationOverviewDto, AdminCardTransferDestinationPendingDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { AdminCardAccountView } from "./AdminCardAccountView";

vi.mock("@/services/admin-wallets.service", () => ({
  adminWalletsService: { cardDestination: vi.fn(), changeCardDestination: vi.fn(), deactivateCardDestination: vi.fn(), approveCardDestination: vi.fn(), rejectCardDestination: vi.fn() },
}));

const envOverview = (canEdit: boolean): AdminCardTransferDestinationOverviewDto => ({
  source: "ENV",
  current: { cardNumberMasked: "**** **** **** 7890", shebaMasked: null, holderName: "PET LIFE OS", bankName: null },
  canEdit,
  pending: null,
  approvalWindowHours: 48,
  history: [],
});

const PROPOSAL: AdminCardTransferDestinationPendingDto = {
  id: "11111111-1111-4111-8111-111111111111",
  cardNumberMasked: "**** **** **** 1231",
  shebaMasked: null,
  holderName: "شرکت پت لایف",
  bankName: "سامان",
  reason: "Owner moved payments to the company account",
  requestedBy: "Sara",
  requestedAt: "2026-11-13T08:00:00.000Z",
  expiresAt: "2026-11-15T08:00:00.000Z",
  requestedByMe: false,
  canApprove: true,
  canReject: true,
};

const withPending = (pending: Partial<AdminCardTransferDestinationPendingDto>, canEdit = true): AdminCardTransferDestinationOverviewDto => ({
  ...envOverview(canEdit),
  pending: { ...PROPOSAL, ...pending },
  history: [
    {
      id: PROPOSAL.id,
      cardNumberMasked: PROPOSAL.cardNumberMasked,
      shebaMasked: null,
      holderName: PROPOSAL.holderName,
      bankName: PROPOSAL.bankName,
      active: false,
      status: "PENDING",
      reason: PROPOSAL.reason,
      createdAt: PROPOSAL.requestedAt,
      createdBy: "Sara",
      expiresAt: PROPOSAL.expiresAt,
      approvedAt: null,
      approvedBy: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
    },
  ],
});

const pendingCard = () => screen.getByRole("heading", { name: "Change waiting for approval" }).closest("section")!;
const CONFIRM_APPROVAL = "I checked with the requester that this account belongs to opetlife.";

describe("AdminCardAccountView", () => {
  beforeEach(() => {
    vi.mocked(adminWalletsService.cardDestination).mockReset();
    vi.mocked(adminWalletsService.changeCardDestination).mockReset();
    vi.mocked(adminWalletsService.approveCardDestination).mockReset();
    vi.mocked(adminWalletsService.rejectCardDestination).mockReset();
  });

  it("shows the account masked and read-only to finance staff", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(envOverview(false));
    renderWithIntl(<AdminCardAccountView />, "en");
    expect(await screen.findByText("**** **** **** 7890")).toBeTruthy();
    expect(screen.getByText(/Only a super admin with settings.manage/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for approval" })).toBeNull();
  });

  it("needs a reason and the ownership confirmation before a super admin sends a new account for approval", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(envOverview(true));
    vi.mocked(adminWalletsService.changeCardDestination).mockResolvedValue(withPending({ requestedByMe: true, canApprove: false }));
    renderWithIntl(<AdminCardAccountView />, "en");
    expect(await screen.findByText(/another super admin approves it within 48 hours/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Card number (16 digits)"), { target: { value: "6219 8600 0000 1231" } });
    fireEvent.change(screen.getByLabelText("Account holder"), { target: { value: "شرکت پت لایف" } });
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByText("Write a reason of at least 10 characters.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "Owner moved payments to the company account" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByText("Confirm that the account belongs to opetlife.")).toBeTruthy();
    expect(adminWalletsService.changeCardDestination).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("I confirm this account belongs to opetlife."));
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(adminWalletsService.changeCardDestination).toHaveBeenCalledWith({ cardNumber: "6219 8600 0000 1231", sheba: undefined, holderName: "شرکت پت لایف", bankName: undefined, reason: "Owner moved payments to the company account" }));
    expect(await screen.findByText("Sent for approval. The current account stays in use until another super admin approves it.")).toBeTruthy();
    // Members keep the current account; the proposal waits in its own card, and a second one cannot be started.
    expect(screen.getByText("**** **** **** 7890")).toBeTruthy();
    expect(within(pendingCard()).getByText("**** **** **** 1231")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send for approval" })).toBeNull();
    expect(screen.getByText(/A change is already waiting for approval/)).toBeTruthy();
  });

  it("lets another super admin approve the proposal only after confirming the account", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(withPending({}));
    vi.mocked(adminWalletsService.approveCardDestination).mockResolvedValue({
      ...envOverview(true),
      source: "ADMIN",
      current: { cardNumberMasked: "**** **** **** 1231", shebaMasked: null, holderName: "شرکت پت لایف", bankName: "سامان" },
    });
    renderWithIntl(<AdminCardAccountView />, "en");
    await screen.findByRole("heading", { name: "Change waiting for approval" });
    const card = pendingCard();
    expect(within(card).getByText(/Sara/)).toBeTruthy();
    expect(within(card).getByText("Owner moved payments to the company account")).toBeTruthy();
    expect(within(card).getByText("Expires")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Approve and activate" }));
    expect(await screen.findByText("Confirm that you checked the account before approving it.")).toBeTruthy();
    expect(adminWalletsService.approveCardDestination).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByLabelText(CONFIRM_APPROVAL));
    fireEvent.click(within(card).getByRole("button", { name: "Approve and activate" }));
    await waitFor(() => expect(adminWalletsService.approveCardDestination).toHaveBeenCalledWith(PROPOSAL.id));
    expect(await screen.findByText("Approved: the new account is now active and super admins were notified.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Change waiting for approval" })).toBeNull();
    expect(screen.getByText("**** **** **** 1231")).toBeTruthy();
  });

  it("never offers Approve to the requester, who can only withdraw with a reason", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(withPending({ requestedByMe: true, canApprove: false }));
    vi.mocked(adminWalletsService.rejectCardDestination).mockResolvedValue(envOverview(true));
    renderWithIntl(<AdminCardAccountView />, "en");
    await screen.findByRole("heading", { name: "Change waiting for approval" });
    const card = pendingCard();
    expect(within(card).queryByRole("button", { name: "Approve and activate" })).toBeNull();
    expect(within(card).queryByLabelText(CONFIRM_APPROVAL)).toBeNull();
    expect(within(card).queryByRole("button", { name: "Reject" })).toBeNull();
    expect(within(card).getByText(/You requested this change, so another super admin must approve it/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Withdraw my request" }));
    expect(await screen.findByText("Write a reason of at least 10 characters.")).toBeTruthy();
    expect(adminWalletsService.rejectCardDestination).not.toHaveBeenCalled();
    fireEvent.change(within(card).getByLabelText("Reason for withdrawing"), { target: { value: "Typed the wrong card number" } });
    fireEvent.click(within(card).getByRole("button", { name: "Withdraw my request" }));
    await waitFor(() => expect(adminWalletsService.rejectCardDestination).toHaveBeenCalledWith(PROPOSAL.id, "Typed the wrong card number"));
    expect(await screen.findByText("Your request was withdrawn; the current account is unchanged.")).toBeTruthy();
  });

  it("lets another super admin reject the proposal with a reason, leaving the current account as it was", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(withPending({}));
    vi.mocked(adminWalletsService.rejectCardDestination).mockResolvedValue(envOverview(true));
    renderWithIntl(<AdminCardAccountView />, "en");
    await screen.findByRole("heading", { name: "Change waiting for approval" });
    const card = pendingCard();
    fireEvent.change(within(card).getByLabelText("Reason for rejecting"), { target: { value: "Not our company account" } });
    fireEvent.click(within(card).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(adminWalletsService.rejectCardDestination).toHaveBeenCalledWith(PROPOSAL.id, "Not our company account"));
    expect(adminWalletsService.approveCardDestination).not.toHaveBeenCalled();
    expect(await screen.findByText("The change was rejected; the current account is unchanged.")).toBeTruthy();
    expect(screen.getByText("**** **** **** 7890")).toBeTruthy();
  });

  it("shows a waiting proposal to finance without any decision buttons", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(withPending({ canApprove: false, canReject: false }, false));
    renderWithIntl(<AdminCardAccountView />, "en");
    await screen.findByRole("heading", { name: "Change waiting for approval" });
    const card = pendingCard();
    expect(within(card).getByText("**** **** **** 1231")).toBeTruthy();
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    // The history marks it as waiting.
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
  });

  it("explains a refused self-approval and reloads when the proposal was already decided", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(withPending({}));
    vi.mocked(adminWalletsService.approveCardDestination)
      .mockRejectedValueOnce(new ApiError({ code: "CARD_DESTINATION_SELF_APPROVAL", message: "x", requestId: "r", details: { reason: "SELF_APPROVAL" } }, 409))
      .mockRejectedValueOnce(new ApiError({ code: "CARD_DESTINATION_CHANGE_NOT_PENDING", message: "x", requestId: "r", details: { reason: "NOT_PENDING" } }, 409));
    renderWithIntl(<AdminCardAccountView />, "en");
    await screen.findByRole("heading", { name: "Change waiting for approval" });
    fireEvent.click(within(pendingCard()).getByLabelText(CONFIRM_APPROVAL));
    fireEvent.click(within(pendingCard()).getByRole("button", { name: "Approve and activate" }));
    expect(await screen.findByText("You requested this change; another super admin must approve it.")).toBeTruthy();
    expect(adminWalletsService.cardDestination).toHaveBeenCalledTimes(1);
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(envOverview(true));
    fireEvent.click(within(pendingCard()).getByRole("button", { name: "Approve and activate" }));
    expect(await screen.findByText("This change was already decided; the page has been refreshed.")).toBeTruthy();
    await waitFor(() => expect(adminWalletsService.cardDestination).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Change waiting for approval" })).toBeNull());
  });
});
