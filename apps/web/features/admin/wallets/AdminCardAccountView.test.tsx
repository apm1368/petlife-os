import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminCardTransferDestinationOverviewDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { AdminCardAccountView } from "./AdminCardAccountView";

vi.mock("@/services/admin-wallets.service", () => ({ adminWalletsService: { cardDestination: vi.fn(), changeCardDestination: vi.fn(), deactivateCardDestination: vi.fn() } }));

const envOverview = (canEdit: boolean): AdminCardTransferDestinationOverviewDto => ({
  source: "ENV",
  current: { cardNumberMasked: "**** **** **** 7890", shebaMasked: null, holderName: "PET LIFE OS", bankName: null },
  canEdit,
  history: [],
});

describe("AdminCardAccountView", () => {
  beforeEach(() => {
    vi.mocked(adminWalletsService.cardDestination).mockReset();
    vi.mocked(adminWalletsService.changeCardDestination).mockReset();
  });

  it("shows the account masked and read-only to finance staff", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(envOverview(false));
    renderWithIntl(<AdminCardAccountView />, "en");
    expect(await screen.findByText("**** **** **** 7890")).toBeTruthy();
    expect(screen.getByText(/Only a super admin with settings.manage/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save the new account" })).toBeNull();
  });

  it("needs a reason and the ownership confirmation before a super admin saves a new account", async () => {
    vi.mocked(adminWalletsService.cardDestination).mockResolvedValue(envOverview(true));
    vi.mocked(adminWalletsService.changeCardDestination).mockResolvedValue({ ...envOverview(true), source: "ADMIN", current: { cardNumberMasked: "**** **** **** 1231", shebaMasked: null, holderName: "شرکت پت لایف", bankName: "سامان" } });
    renderWithIntl(<AdminCardAccountView />, "en");
    fireEvent.change(await screen.findByLabelText("Card number (16 digits)"), { target: { value: "6219 8600 0000 1231" } });
    fireEvent.change(screen.getByLabelText("Account holder"), { target: { value: "شرکت پت لایف" } });
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new account" }));
    expect(await screen.findByText("Write a reason of at least 10 characters.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "Owner moved payments to the company account" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the new account" }));
    expect(await screen.findByText("Confirm that the account belongs to opetlife.")).toBeTruthy();
    expect(adminWalletsService.changeCardDestination).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("I confirm this account belongs to opetlife."));
    fireEvent.click(screen.getByRole("button", { name: "Save the new account" }));
    await waitFor(() => expect(adminWalletsService.changeCardDestination).toHaveBeenCalledWith({ cardNumber: "6219 8600 0000 1231", sheba: undefined, holderName: "شرکت پت لایف", bankName: undefined, reason: "Owner moved payments to the company account" }));
    expect(await screen.findByText("**** **** **** 1231")).toBeTruthy();
  });
});
