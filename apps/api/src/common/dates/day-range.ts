import { ValidationApiException } from "../errors/api-exception";

export const DAY_MS = 86_400_000;

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A `yyyy-mm-dd` calendar day as UTC midnight; impossible dates such as 02-31 are rejected. */
export function parseDay(value: string): Date {
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || dayKey(date) !== value) throw new ValidationApiException({ field: "date", value });
  return date;
}

/**
 * An inclusive day range from optional query days, defaulting to the current UTC calendar year. The caller
 * chooses the calendar (a Jalali year is just a from/to pair), so the server stays calendar-agnostic.
 */
export function parseDayRange(query: { from?: string; to?: string }, maxDays = 400): { from: Date; to: Date; toExclusive: Date } {
  const now = new Date();
  const from = query.from ? parseDay(query.from) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = query.to ? parseDay(query.to) : new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
  if (to < from) throw new ValidationApiException({ field: "to", reason: "BEFORE_FROM" });
  if ((to.getTime() - from.getTime()) / DAY_MS > maxDays) throw new ValidationApiException({ field: "to", reason: "RANGE_TOO_LONG", maxDays });
  return { from, to, toExclusive: new Date(to.getTime() + DAY_MS) };
}
