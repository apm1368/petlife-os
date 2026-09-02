/**
 * Quiet-hours evaluation — deliberately pure clock/timezone semantics
 * (spec: "avoid Persian-calendar coupling here"), built entirely on ICU
 * (`Intl.DateTimeFormat`) with no new date library, mirroring how Jalali/
 * Gregorian dual display is done elsewhere in this codebase.
 *
 * `nextQuietHoursEndUtc` computes "the next UTC instant at which the local
 * clock in `timezone` reads `endTime`" by taking the difference between the
 * current and target LOCAL clock minutes and adding that many minutes to
 * the current UTC instant — correct as long as no DST transition falls
 * between now and then. Iran (this project's only real CountryConfig entry)
 * has had no DST since 2022, so this is exact for it; a future country
 * config with an active DST rule would need a real timezone-offset lookup
 * here, not just this delta approach — documented as a known limitation.
 */

function localHHmm(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function parseHHmm(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Handles the overnight-wrap case (e.g. 22:00 -> 08:00) as well as a same-day window. A zero-length window (start === end) is never quiet. */
export function isWithinQuietHours(now: Date, startTime: string, endTime: string, timezone: string): boolean {
  const nowMinutes = parseHHmm(localHHmm(now, timezone));
  const start = parseHHmm(startTime);
  const end = parseHHmm(endTime);
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

/** The next UTC instant at which the local clock in `timezone` reads `endTime` — always strictly in the future relative to `now`. */
export function nextQuietHoursEndUtc(now: Date, endTime: string, timezone: string): Date {
  const nowLocalMinutes = parseHHmm(localHHmm(now, timezone));
  const targetMinutes = parseHHmm(endTime);
  let deltaMinutes = targetMinutes - nowLocalMinutes;
  if (deltaMinutes <= 0) deltaMinutes += 24 * 60;
  return new Date(now.getTime() + deltaMinutes * 60_000);
}
