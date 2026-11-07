import { describe, expect, it } from "vitest";
import { formatCount } from "./format-number";

describe("formatCount locale formatting", () => {
  it.each([["fa", "۱۲٬۳۴۵"], ["en", "12,345"], ["de", "12.345"], ["es", "12.345"]])(
    "formats counts using the %s locale",
    (locale, expected) => {
      expect(formatCount(12345, locale)).toBe(expected);
    },
  );
});
