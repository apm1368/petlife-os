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
export function deriveWalletBalances(entries: Pick<WalletEntry, "id" | "balanceType" | "kind" | "amount" | "expiresAt" | "source" | "referenceType" | "referenceId">[], now = new Date()): Record<WalletBalanceType, number> {
  const balances: Record<WalletBalanceType, number> = {
    [WalletBalanceType.WITHDRAWABLE]: 0,
    [WalletBalanceType.PURCHASE_ONLY]: 0,
  };
  // Expired gift credit is excluded immediately, even before the worker has
  // written its audit expiry row. Once that row exists it must also be
  // excluded, otherwise the same gift would be subtracted twice.
  const expiredGiftIds = new Set(entries
    .filter((entry) => entry.kind === WalletEntryKind.CREDIT && entry.source === "GIFT" && entry.expiresAt && entry.expiresAt <= now)
    .map((entry) => entry.id));
  for (const entry of entries) {
    if (entry.kind === WalletEntryKind.CREDIT && entry.expiresAt && entry.expiresAt <= now) continue;
    if (entry.kind === WalletEntryKind.EXPIRY && entry.referenceType === "WALLET_GIFT_EXPIRY" && expiredGiftIds.has(entry.referenceId)) continue;
    balances[entry.balanceType] += entry.kind === WalletEntryKind.CREDIT ? entry.amount : -entry.amount;
  }
  return balances;
}

export function sixMonthGiftExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCMonth(expires.getUTCMonth() + 6);
  return expires;
}
