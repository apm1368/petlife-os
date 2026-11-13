/** One official public holiday in Iran (generated into iran-holidays.data.ts by scripts/fetch-iran-holidays.mjs). */
export interface OfficialHoliday {
  /** Gregorian calendar date of the Tehran day, YYYY-MM-DD. */
  date: string;
  /** The same day in the Persian calendar, YYYY-MM-DD. */
  jalali: string;
  /** Official Persian name(s) of the day. */
  title: string;
  religious: boolean;
}

const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;

/** The Tehran calendar day (YYYY-MM-DD) an instant falls on — Iran has kept a fixed UTC+03:30 since 2022. */
export function tehranDateKey(at: Date): string {
  return new Date(at.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const PERSIAN = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });

/** Persian (Jalali) date of a Gregorian YYYY-MM-DD day. */
export function jalaliOf(date: string): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(PERSIAN.formatToParts(new Date(`${date}T00:00:00Z`)).filter((p) => p.type !== "literal").map((p) => [p.type, Number.parseInt(p.value, 10)]));
  return { year: parts.year!, month: parts.month!, day: parts.day! };
}

/** First and last Gregorian day (YYYY-MM-DD) of a Persian year; 1 Farvardin is always 20 or 21 March. */
export function persianYearRange(year: number): { from: string; to: string } {
  const find = (y: number) => {
    for (let t = Date.UTC(y + 621, 2, 18); ; t += 86_400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (jalaliOf(iso).year === y) return iso;
    }
  };
  const next = find(year + 1);
  return { from: find(year), to: new Date(Date.parse(`${next}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) };
}
