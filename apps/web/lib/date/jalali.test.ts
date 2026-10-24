import { describe, expect, it } from "vitest";
import { addDays, calendarFromIso, daysBetween, formatDay, isIsoDay, isJalaliLeapYear, isoFrom, monthGrid, monthLength, toGregorian, toJalali, weekday } from "./jalali";

describe("jalali calendar", () => {
  it("converts known Nowruz dates both ways", () => {
    expect(toJalali({ year: 2024, month: 3, day: 20 })).toEqual({ year: 1403, month: 1, day: 1 });
    expect(toJalali({ year: 2025, month: 3, day: 21 })).toEqual({ year: 1404, month: 1, day: 1 });
    expect(toJalali({ year: 2026, month: 3, day: 21 })).toEqual({ year: 1405, month: 1, day: 1 });
    expect(toGregorian({ year: 1403, month: 12, day: 30 })).toEqual({ year: 2025, month: 3, day: 20 });
    expect(toGregorian({ year: 1405, month: 7, day: 6 })).toEqual({ year: 2026, month: 9, day: 28 });
  });

  it("knows leap years and month lengths", () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(monthLength("jalali", 1403, 12)).toBe(30);
    expect(monthLength("jalali", 1404, 12)).toBe(29);
    expect(monthLength("jalali", 1405, 6)).toBe(31);
    expect(monthLength("jalali", 1405, 7)).toBe(30);
    expect(monthLength("gregorian", 2028, 2)).toBe(29);
  });

  it("round-trips every day across several years", () => {
    let iso = "2023-01-01";
    for (let i = 0; i < 365 * 6; i += 1) {
      expect(isoFrom("jalali", calendarFromIso("jalali", iso))).toBe(iso);
      iso = addDays(iso, 1);
    }
  });

  it("does day arithmetic across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-09-28", "2026-10-05")).toBe(7);
    expect(weekday("2026-09-28")).toBe(1);
  });

  it("validates ISO day keys", () => {
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2028-02-29")).toBe(true);
    expect(isIsoDay("2026-9-1")).toBe(false);
    expect(isIsoDay(null)).toBe(false);
  });

  it("builds a Saturday-first Jalali grid and a Monday-first Gregorian grid", () => {
    const mehr = monthGrid("jalali", 1405, 7);
    expect(mehr).toHaveLength(42);
    const first = mehr.find((c) => c.inMonth)!;
    expect(first.day).toBe(1);
    expect(mehr.filter((c) => c.inMonth)).toHaveLength(30);
    expect(weekday(mehr[0]!.iso)).toBe(6);
    const sept = monthGrid("gregorian", 2026, 9);
    expect(weekday(sept[0]!.iso)).toBe(1);
    expect(sept.filter((c) => c.inMonth)).toHaveLength(30);
  });

  it("formats in Persian digits with Jalali months, and in English with Gregorian months", () => {
    expect(formatDay("2026-09-28", "fa")).toBe("۶ مهر ۱۴۰۵");
    expect(formatDay("2026-09-28", "en")).toBe("28 September 2026");
    expect(formatDay("2026-09-28", "en", { weekday: true, year: false })).toBe("Monday, 28 September");
  });
});
