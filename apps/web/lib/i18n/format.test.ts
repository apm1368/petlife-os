import { describe, expect, it } from "vitest";
import { formatLocaleDate, formatLocaleNumber } from "./format";

describe("locale formatting", () => {
  it("uses Persian calendar/digits and LTR locale conventions for translated routes", () => {
    expect(formatLocaleNumber(1234.5, "fa")).toContain("۱");
    expect(formatLocaleNumber(12345.6, "de")).toContain("12.345,6");
    expect(formatLocaleNumber(12345.6, "es")).toContain("12.345,6");
    expect(formatLocaleDate("2026-01-02T12:00:00.000Z", "fa")).not.toBe(formatLocaleDate("2026-01-02T12:00:00.000Z", "en"));
    expect(formatLocaleDate("2026-01-02T12:00:00.000Z", "de")).toBe("02.01.2026");
    expect(formatLocaleDate("2026-01-02T12:00:00.000Z", "es")).toContain("ene");
  });
});
