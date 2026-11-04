import { WalletBalanceType, WalletEntryKind } from "@prisma/client";
import { BOOKING_CARD_TRANSFER_MINIMUM_MS, cardTransferAllowedForBooking, deriveWalletBalances, sixMonthGiftExpiry } from "./payment-infrastructure.policy";

describe("payment infrastructure domain policies", () => {
  it("rejects card-to-card for a booking under 24 hours and permits it at 24 hours", () => {
    const now = new Date("2026-11-04T10:00:00.000Z");
    expect(cardTransferAllowedForBooking(new Date(now.getTime() + BOOKING_CARD_TRANSFER_MINIMUM_MS - 1), now)).toBe(false);
    expect(cardTransferAllowedForBooking(new Date(now.getTime() + BOOKING_CARD_TRANSFER_MINIMUM_MS), now)).toBe(true);
  });

  it("keeps the two wallet balance types separate and excludes an expired gift credit", () => {
    const now = new Date("2026-11-04T10:00:00.000Z");
    const balances = deriveWalletBalances([
      { balanceType: WalletBalanceType.WITHDRAWABLE, kind: WalletEntryKind.CREDIT, amount: 500, expiresAt: null },
      { balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.CREDIT, amount: 300, expiresAt: new Date("2026-11-03T10:00:00.000Z") },
      { balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.CREDIT, amount: 200, expiresAt: new Date("2027-01-01T00:00:00.000Z") },
      { balanceType: WalletBalanceType.WITHDRAWABLE, kind: WalletEntryKind.DEBIT, amount: 125, expiresAt: null },
    ] as never[], now);
    expect(balances).toEqual({ WITHDRAWABLE: 375, PURCHASE_ONLY: 200 });
  });

  it("gives a gift credit a six-month expiry window", () => {
    expect(sixMonthGiftExpiry(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
