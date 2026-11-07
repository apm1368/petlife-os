import { describe, expect, it } from "vitest";
import { formatLocaleDate } from "./format-locale-date";

describe("formatLocaleDate", () => {
  const value = "2026-01-15T12:00:00.000Z";

  it.each([["en", "1/15/2026"], ["de", "15.1.2026"], ["es", "15/1/2026"]])(
    "uses the selected Gregorian locale for %s",
    (locale, expected) => {
      expect(formatLocaleDate(value, locale)).toBe(expected);
    },
  );

  it("keeps Persian Jalali date formatting for fa", () => {
    expect(formatLocaleDate(value, "fa")).toBe(new Intl.DateTimeFormat("fa-IR").format(new Date(value)));
  });
});
