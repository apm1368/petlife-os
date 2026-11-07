import { describe, expect, it } from "vitest";
import { countryName, formatCount } from "./format-number";

describe("locale-aware number formatting", () => {
  it.each(["de", "es"] as const)("formats counts with %s separators", (locale) => {
    expect(formatCount(1_234_567, locale)).toBe("1.234.567");
  });

  it("localizes country names without changing Persian calendar digits", () => {
    expect(countryName("US", "de")).toBe("Vereinigte Staaten");
    expect(countryName("US", "es")).toBe("Estados Unidos");
    expect(formatCount(1234, "fa")).toBe("۱٬۲۳۴");
  });
});
