import { WalletBalanceType, WalletEntryKind } from "@prisma/client";
import { BOOKING_CARD_TRANSFER_MINIMUM_MS, cardTransferAllowedForBooking, deriveWalletBalances, replayWallet, sixMonthGiftExpiry } from "./payment-infrastructure.policy";

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

  describe("gift credit is spent first and only its unspent remainder expires", () => {
    const d = (iso: string) => new Date(iso);
    const gift = { id: "g1", balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.CREDIT, amount: 300, expiresAt: d("2026-06-01T00:00:00Z"), source: "GIFT", createdAt: d("2026-01-01T00:00:00Z") };
    const topUp = { id: "t1", balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.CREDIT, amount: 500, expiresAt: null, source: "TOP_UP", createdAt: d("2026-01-02T00:00:00Z") };
    const spend = (amount: number, iso: string) => ({ id: `d-${iso}`, balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.DEBIT, amount, expiresAt: null, source: null, createdAt: d(iso) });

    it("a fully spent gift leaves nothing to expire (the balance never goes negative)", () => {
      const entries = [gift, topUp, spend(300, "2026-02-01T00:00:00Z")] as never[];
      expect(deriveWalletBalances(entries, d("2026-07-01T00:00:00Z"))).toEqual({ WITHDRAWABLE: 0, PURCHASE_ONLY: 500 });
      expect(replayWallet(entries, d("2026-07-01T00:00:00Z")).expired).toEqual([]);
    });

    it("a partly spent gift expires only what is left of it", () => {
      const entries = [gift, topUp, spend(100, "2026-02-01T00:00:00Z")] as never[];
      const before = replayWallet(entries, d("2026-05-01T00:00:00Z"));
      expect(before.balances.PURCHASE_ONLY).toBe(700);
      expect(before.open).toEqual([expect.objectContaining({ creditId: "g1", remaining: 200 })]);
      const after = replayWallet(entries, d("2026-07-01T00:00:00Z"));
      expect(after.balances.PURCHASE_ONLY).toBe(500);
      expect(after.expired).toEqual([expect.objectContaining({ creditId: "g1", remaining: 200 })]);
    });

    it("spending after a gift lapsed comes from the rest of the bucket, and expiry rows are not counted twice", () => {
      const expiryRow = { id: "x1", balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.EXPIRY, amount: 300, expiresAt: null, source: null, referenceType: "WALLET_GIFT_EXPIRY", referenceId: "g1", createdAt: d("2026-06-02T00:00:00Z") };
      const entries = [gift, topUp, expiryRow, spend(200, "2026-06-10T00:00:00Z")] as never[];
      expect(deriveWalletBalances(entries, d("2026-07-01T00:00:00Z"))).toEqual({ WITHDRAWABLE: 0, PURCHASE_ONLY: 300 });
    });
  });
});

