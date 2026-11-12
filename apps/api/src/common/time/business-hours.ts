/**
 * Working hours in Tehran (fixed UTC+03:30): Saturday–Wednesday 09:00–17:00, Thursday 09:00–13:00, Friday closed.
 * Used for staff service targets such as "partner KYC reviewed within 24 working hours" (market-readiness Q73).
 * `closedDays` (Tehran dates, YYYY-MM-DD) removes whole days: Iran's official holidays plus staff closures, as
 * HolidayCalendarService.closedDays() supplies them. Without it only the weekly pattern applies.
 */
const OFFSET_MS = 3.5 * 3_600_000;
const HOUR = 3_600_000;
/** Index by JS getUTCDay() on the Tehran-shifted date: 0 Sunday … 6 Saturday. */
const WINDOWS: Record<number, [number, number] | null> = {
  6: [9, 17], // Saturday
  0: [9, 17], // Sunday
  1: [9, 17], // Monday
  2: [9, 17], // Tuesday
  3: [9, 17], // Wednesday
  4: [9, 13], // Thursday
  5: null, // Friday
};

export function businessHoursBetween(start: Date, end: Date, closedDays?: ReadonlySet<string>): number {
  if (end <= start) return 0;
  const from = start.getTime() + OFFSET_MS;
  const to = end.getTime() + OFFSET_MS;
  let total = 0;
  // Walk Tehran calendar days; bounded so a very old timestamp cannot spin (400 days ≈ more than any SLA needs).
  let day = Math.floor(from / 86_400_000) * 86_400_000;
  for (let i = 0; day < to && i < 400; i++, day += 86_400_000) {
    const window = WINDOWS[new Date(day).getUTCDay()];
    if (!window) continue;
    if (closedDays?.has(new Date(day).toISOString().slice(0, 10))) continue;
    const open = day + window[0] * HOUR;
    const close = day + window[1] * HOUR;
    const overlap = Math.min(close, to) - Math.max(open, from);
    if (overlap > 0) total += overlap;
  }
  return total / HOUR;
}
