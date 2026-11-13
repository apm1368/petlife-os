import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { WalletSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { businessWalletService, businessWalletsService, walletService } from "@/services/wallet.service";
import { WalletView, parseToman } from "./WalletView";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/en/profile/wallet",
}));
vi.mock("@/services/sponsored.service", () => ({ sponsoredService: { overview: vi.fn(() => Promise.reject(new Error("not in this test"))), targets: vi.fn(), create: vi.fn(), setStatus: vi.fn() } }));
vi.mock("@/services/wallet.service", () => ({
  walletService: { summary: vi.fn(), topUps: vi.fn(), entries: vi.fn(), startTopUp: vi.fn(), topUp: vi.fn(), cancel: vi.fn(), receiptUploadTarget: vi.fn(), submitReceipt: vi.fn(), verifyZibal: vi.fn() },
  businessWalletsService: { list: vi.fn(() => Promise.resolve([])) },
  businessWalletService: vi.fn(),
}));

function summary(rails: WalletSummaryDto["topUp"]["rails"]): WalletSummaryDto {
  return {
    balances: { purchaseOnly: 1_500_000, withdrawable: 250_000, total: 1_750_000, currency: "IRR" },
    expiringSoon: [],
    topUp: { rails, minAmount: 100_000, maxAmount: 500_000_000, presets: [500_000, 1_000_000, 2_000_000, 5_000_000] },
  };
}

describe("WalletView", () => {
  beforeEach(() => {
    vi.mocked(walletService.summary).mockReset();
    vi.mocked(walletService.topUps).mockReset().mockResolvedValue([]);
    vi.mocked(walletService.entries).mockReset().mockResolvedValue({
      items: [{ id: "e1", kind: "CREDIT", balanceType: "PURCHASE_ONLY", source: "MANUAL_CORRECTION", signedAmount: 500_000, purpose: "ADJUSTMENT", note: "SERVICE_RECOVERY", expiresAt: null, createdAt: "2026-11-12T08:00:00.000Z" }],
      nextCursor: null,
    });
    vi.mocked(walletService.startTopUp).mockReset();
  });

  it("shows both buckets in Toman and explains a correction instead of hiding it", async () => {
    vi.mocked(walletService.summary).mockResolvedValue(summary([]));
    renderWithIntl(<WalletView />, "en");
    expect(await screen.findByText("175,000 Toman")).toBeTruthy();
    expect(screen.getByText("150,000 Toman")).toBeTruthy();
    expect(screen.getByText("25,000 Toman")).toBeTruthy();
    expect(screen.getByText("Correction by our team")).toBeTruthy();
    expect(screen.getByText(/Making up for a service problem/)).toBeTruthy();
    // No rail configured: say so, never offer a button that cannot take money.
    expect(screen.getByText("Top-ups open soon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add money" })).toBeNull();
  });

  it("starts a card-to-card top-up in rials and shows the card to transfer to", async () => {
    vi.mocked(walletService.summary).mockResolvedValue(summary(["CARD_TO_CARD"]));
    vi.mocked(walletService.startTopUp).mockResolvedValue({
      topUp: { id: "t1", rail: "CARD_TO_CARD", status: "AWAITING_RECEIPT", amount: 2_000_000, receivedAmount: null, currency: "IRR", receiptUploaded: false, receiptDeadlineAt: "2026-11-13T08:00:00.000Z", rejectionReason: null, createdAt: "2026-11-12T08:00:00.000Z", creditedAt: null, walletAccountId: null },
      redirectUrl: null,
      cardTransfer: { cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS", bankName: null, sheba: null },
    });
    renderWithIntl(<WalletView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "200,000 Toman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add money" }));
    await waitFor(() => expect(walletService.startTopUp).toHaveBeenCalled());
    expect(vi.mocked(walletService.startTopUp).mock.calls[0]![0]).toEqual({ amount: 2_000_000, rail: "CARD_TO_CARD", locale: "en" });
    expect(await screen.findByText("6037-9912-3456-7890")).toBeTruthy();
    expect(screen.getByText("PET LIFE OS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send receipt" })).toBeTruthy();
  });

  it("lists the business wallets the member manages, each linking to its own page", async () => {
    vi.mocked(walletService.summary).mockResolvedValue(summary([]));
    vi.mocked(businessWalletsService.list).mockResolvedValueOnce([
      { owner: { walletAccountId: "w-shop", type: "SELLER", ownerId: "s1", name: "Paws Shop" }, role: "OWNER", balances: { purchaseOnly: 3_000_000, withdrawable: 0, total: 3_000_000, currency: "IRR" } },
    ]);
    renderWithIntl(<WalletView />, "en");
    const link = await screen.findByRole("link", { name: /Paws Shop/ });
    expect(link.getAttribute("href")).toBe("/en/profile/wallet/business/w-shop");
    expect(screen.getByText("300,000 Toman")).toBeTruthy();
  });

  it("shows a business wallet from its own endpoints, titled with the organisation", async () => {
    const api = { summary: vi.fn(), topUps: vi.fn().mockResolvedValue([]), entries: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), startTopUp: vi.fn() };
    api.summary.mockResolvedValue({ ...summary([]), owner: { walletAccountId: "w-shop", type: "SELLER", ownerId: "s1", name: "Paws Shop" } });
    vi.mocked(businessWalletService).mockReturnValue(api);
    renderWithIntl(<WalletView accountId="w-shop" />, "en");
    expect(await screen.findByRole("heading", { name: /Paws Shop/ })).toBeTruthy();
    expect(businessWalletService).toHaveBeenCalledWith("w-shop");
    expect(walletService.summary).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to my wallet" }).getAttribute("href")).toBe("/en/profile/wallet");
  });

  it("renders the Persian page with Persian labels", async () => {
    vi.mocked(walletService.summary).mockResolvedValue(summary(["CARD_TO_CARD"]));
    renderWithIntl(<WalletView />, "fa");
    expect(await screen.findByRole("heading", { name: "کیف پول" })).toBeTruthy();
    expect(screen.getByText("کارت به کارت")).toBeTruthy();
  });

  it("reads Toman typed with Persian digits and separators", () => {
    expect(parseToman("۲۰۰٬۰۰۰")).toBe(200_000);
    expect(parseToman("1,500")).toBe(1500);
    expect(parseToman("12a")).toBeNull();
  });
});
