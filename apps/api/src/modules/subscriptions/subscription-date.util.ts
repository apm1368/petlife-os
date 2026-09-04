import { SubscriptionBillingInterval } from "@prisma/client";

/**
 * Deliberately plain `Date` arithmetic — no new date-library dependency for
 * two interval types. Month-end edge case (e.g. Jan 31 + 1 month): native
 * `Date` rolls forward into the next month (Jan 31 -> Mar 3) rather than
 * clamping to Feb 28/29 — an accepted, documented simplification (see
 * README "Known limitations"); it never produces an earlier date than the
 * start, which is the only invariant billing correctness actually depends
 * on (a period never has non-positive length).
 */
export function addBillingInterval(start: Date, interval: SubscriptionBillingInterval): Date {
  const next = new Date(start);
  if (interval === SubscriptionBillingInterval.ANNUAL) {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export function addDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}
