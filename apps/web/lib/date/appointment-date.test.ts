import { describe, expect, it } from "vitest";
import { formatAppointmentDateTime, formatDateKey } from "./appointment-date";

const APPOINTMENT = "2026-09-10T05:30:00.000Z"; // 09:00 in Asia/Tehran (UTC+3:30)

describe("appointment date formatting", () => {
  it("renders the Persian locale using the Jalali calendar", () => {
    const formatted = formatAppointmentDateTime(APPOINTMENT, "fa", "Asia/Tehran");
    // Jalali digits/month names are distinct from the Gregorian ones for the same instant.
    expect(formatted).not.toContain("2026");
    expect(formatted).toMatch(/۱۴۰۵/); // Persian digits for the Jalali year 1405
  });

  it("renders the English locale using the Gregorian calendar", () => {
    const formatted = formatAppointmentDateTime(APPOINTMENT, "en", "Asia/Tehran");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("September");
  });

  it("always formats in the provider location's timezone, not an implicit local one", () => {
    const tehran = formatAppointmentDateTime(APPOINTMENT, "en", "Asia/Tehran");
    const utc = formatAppointmentDateTime(APPOINTMENT, "en", "UTC");
    expect(tehran).not.toBe(utc);
    expect(tehran).toContain("9:00"); // 05:30 UTC + 3:30 = 09:00 Tehran
    expect(utc).toContain("5:30");
  });

  it("groups slots by the provider timezone's calendar date, not the UTC date", () => {
    // 23:00 UTC on Sept 9 is already Sept 10 in Tehran (+3:30).
    const key = formatDateKey("2026-09-09T23:00:00.000Z", "Asia/Tehran");
    expect(key).toBe("2026-09-10");
  });
});
