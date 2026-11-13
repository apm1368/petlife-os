import { WalletBalanceType, WalletEntryKind, type WalletEntry } from "@prisma/client";

export const CARD_TRANSFER_RECEIPT_WINDOW_MS = 30 * 60_000;
export const CARD_TRANSFER_UNDERPAYMENT_WINDOW_MS = 30 * 60_000;
export const BOOKING_CARD_TRANSFER_MINIMUM_MS = 24 * 60 * 60_000;

/** Tehran working hours: Sat–Wed 09:00–18:00, Thu 09:00–13:00. */
export function nextWorkingReviewAt(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = parts.weekday;
  const hour = Number(parts.hour);
  // The returned Date is an instant, rather than a guessed local timestamp.
  // 05:30Z is 09:00 Tehran while Iran has UTC+03:30 (no DST).
  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 5, 30));
  const day = weekday === "Sun" ? 0 : weekday === "Mon" ? 1 : weekday === "Tue" ? 2 : weekday === "Wed" ? 3 : weekday === "Thu" ? 4 : weekday === "Fri" ? 5 : 6;
  const openToday = day <= 4 && hour < (day === 4 ? 13 : 18);
  if (openToday) return now;
  const next = new Date(localDate);
  do next.setUTCDate(next.getUTCDate() + 1); while (next.getUTCDay() === 5);
  return next;
}

export function cardTransferAllowedForBooking(startAt: Date, now = new Date()): boolean {
  return startAt.getTime() - now.getTime() >= BOOKING_CARD_TRANSFER_MINIMUM_MS;
}

/** Wallet balances are derived, never persisted. Expired credit is ignored even before the expiry worker appends its audit entry. */
type BalanceEntry = Pick<WalletEntry, "id" | "balanceType" | "kind" | "amount" | "expiresAt" | "source" | "referenceType" | "referenceId"> & { createdAt?: Date };

/** A credit with an expiry (gift credit): what is still unspent of it. */
export interface ExpiringLot {
  creditId: string;
  balanceType: WalletBalanceType;
  expiresAt: Date;
  remaining: number;
}

/**
 * Replays a wallet's entries in time order. Spending uses expiring credit first (soonest expiry first), then the rest
 * of that bucket, so a gift that was spent is never expired again, and only the unspent remainder of a gift lapses.
 * EXPIRY rows are audit records of that lapse and are not counted again.
 */
export function replayWallet(entries: BalanceEntry[], now = new Date()) {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.createdAt && b.entry.createdAt ? a.entry.createdAt.getTime() - b.entry.createdAt.getTime() : 0) || a.index - b.index)
    .map(({ entry }) => entry);
  const plain: Record<WalletBalanceType, number> = { [WalletBalanceType.WITHDRAWABLE]: 0, [WalletBalanceType.PURCHASE_ONLY]: 0 };
  const lots: ExpiringLot[] = [];
  const expired: ExpiringLot[] = [];
  const lapse = (at: Date) => {
    for (let i = lots.length - 1; i >= 0; i--) {
      if (lots[i]!.expiresAt <= at) expired.push(...lots.splice(i, 1));
    }
  };
  for (const entry of ordered) {
    if (entry.createdAt) lapse(entry.createdAt);
    if (entry.kind === WalletEntryKind.EXPIRY) continue;
    if (entry.kind === WalletEntryKind.CREDIT) {
      if (entry.expiresAt) lots.push({ creditId: entry.id, balanceType: entry.balanceType, expiresAt: entry.expiresAt, remaining: entry.amount });
      else plain[entry.balanceType] += entry.amount;
      continue;
    }
    let left = entry.amount;
    for (const lot of lots.filter((l) => l.balanceType === entry.balanceType).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())) {
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
      if (!left) break;
    }
    plain[entry.balanceType] -= left;
  }
  lapse(now);
  const balances: Record<WalletBalanceType, number> = { ...plain };
  for (const lot of lots) balances[lot.balanceType] += lot.remaining;
  return { balances, open: lots.filter((l) => l.remaining > 0), expired: expired.filter((l) => l.remaining > 0) };
}

export function deriveWalletBalances(entries: BalanceEntry[], now = new Date()): Record<WalletBalanceType, number> {
  return replayWallet(entries, now).balances;
}

export function sixMonthGiftExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCMonth(expires.getUTCMonth() + 6);
  return expires;
}
