import { describe, expect, it } from "vitest";
import { dayOf, formatDayOrDateTime, formatTehranDateTime, isDateOnlyValue, tehranDay } from "./tehran";

describe("Tehran dates (QA L12)", () => {
  it("puts an instant on its Tehran day, not its UTC day", () => {
    // 21:30 UTC on 11 Nov is 01:00 on Thursday 12 Nov in Tehran (UTC+3:30).
    expect(tehranDay("2026-11-11T21:30:00.000Z")).toBe("2026-11-12");
    expect(tehranDay("2026-11-11T19:00:00.000Z")).toBe("2026-11-11");
  });

  it("states the day and the time from the same zone, and says which zone", () => {
    expect(formatTehranDateTime("2026-11-11T21:30:00.000Z", "fa", { weekday: true, zone: true })).toBe("پنجشنبه، ۲۱ آبان ۱۴۰۵، ساعت ۰۱:۰۰ (به وقت تهران)");
    expect(formatTehranDateTime("2026-11-11T21:30:00.000Z", "en", { weekday: true, zone: true })).toBe("Thursday, 12 November 2026, 01:00 (Tehran time)");
    expect(formatTehranDateTime("2026-11-11T21:30:00.000Z", "de", { zone: true })).toBe("12 November 2026, 01:00 (Teheraner Zeit)");
    expect(formatTehranDateTime("2026-11-11T21:30:00.000Z", "es", { zone: true })).toBe("12 noviembre 2026, 01:00 (hora de Teherán)");
  });

  it("shows a date-only value as a day without a time", () => {
    expect(isDateOnlyValue("2026-12-15")).toBe(true);
    expect(isDateOnlyValue("2026-12-15T00:00:00.000Z")).toBe(true);
    expect(isDateOnlyValue("2026-12-15T05:30:00.000Z")).toBe(false);
    expect(formatDayOrDateTime("2026-12-15T00:00:00.000Z", "fa")).toBe("۲۴ آذر ۱۴۰۵");
    expect(formatDayOrDateTime("2026-12-15T00:00:00.000Z", "en")).toBe("15 December 2026");
    expect(formatDayOrDateTime("2026-12-15T05:30:00.000Z", "en")).toBe("15 December 2026, 09:00");
    expect(dayOf("2026-12-15T00:00:00.000Z")).toBe("2026-12-15");
    expect(dayOf("2026-12-14T21:00:00.000Z")).toBe("2026-12-15");
  });
});
