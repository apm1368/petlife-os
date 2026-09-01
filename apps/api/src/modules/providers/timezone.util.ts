/**
 * Minimal IANA-timezone <-> UTC conversion using only `Intl.DateTimeFormat`
 * (no external date library is a dependency of this project — see README
 * "Timezone behavior"). Accurate for every instant except the handful of
 * minutes around a DST transition, which this product does not need to get
 * exactly right for slot generation.
 */

/** For a given UTC instant, how many minutes `timeZone`'s wall clock is ahead of UTC. */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** "YYYY-MM-DD" + "HH:mm" wall-clock time in `timeZone` -> the UTC Date it refers to. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = dateStr.split("-").map(Number);
  const [hour = 0, minute = 0] = timeStr.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = offsetMinutesAt(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offset * 60_000);
}

/** The "YYYY-MM-DD" calendar date `instant` falls on in `timeZone`. */
export function localDateString(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    instant,
  );
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The day of week (0=Sunday..6=Saturday) `instant` falls on in `timeZone`. */
export function localDayOfWeek(instant: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/** Every distinct local calendar date `timeZone` observes between `from` and `to` (inclusive), walked in whole-day UTC steps. */
export function enumerateLocalDates(from: Date, to: Date, timeZone: string): string[] {
  const dates = new Set<string>();
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = from.getTime(); t <= to.getTime(); t += dayMs) {
    dates.add(localDateString(new Date(t), timeZone));
  }
  dates.add(localDateString(to, timeZone));
  return Array.from(dates).sort();
}

/** "HH:mm" -> minutes since local midnight, for stepping a rule's window in fixed-size increments. */
export function timeStringToMinutes(timeStr: string): number {
  const [hour = 0, minute = 0] = timeStr.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTimeString(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
