import { describe, expect, it } from "vitest";
import { normalizeIranPhone, toAsciiDigits } from "@petlife/validation";

describe("toAsciiDigits", () => {
  it("converts both digit alphabets and preserves other characters", () => {
    expect(toAsciiDigits("۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩ +abc.123")).toBe("0123456789 0123456789 +abc.123");
    expect(toAsciiDigits("")).toBe("");
  });
});

describe("normalizeIranPhone", () => {
  it.each(["۰۹۱۲۳۴۵۶۷۸۹", "09123456789", "+98 912 345 6789", "٠٩١٢٣٤٥٦٧٨٩", "9123456789", "00989123456789", " (0912) 345-6789 "])("normalizes %s", (input) => {
    expect(normalizeIranPhone(input)).toBe("+989123456789");
  });
  it.each(["", "0912", "091234567890", "+979123456789", "02112345678", "abc09123456789", "0912.3456789", "++989123456789"])("rejects %s", (input) => {
    expect(normalizeIranPhone(input)).toBeNull();
  });
});
