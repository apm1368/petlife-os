import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format-currency";

describe("formatCurrency", () => {
  it("divides IRR by 10 to display Toman, in English", () => {
    expect(formatCurrency(1_250_000, "en")).toBe("125,000 Toman");
  });

  it("divides IRR by 10 to display Toman, in Persian", () => {
    expect(formatCurrency(1_250_000, "fa")).toBe("۱۲۵٬۰۰۰ تومان");
  });

  it("rounds rather than truncating a non-multiple-of-10 amount", () => {
    expect(formatCurrency(1_255_005, "en")).toBe("125,501 Toman");
  });

  it("never produces a fractional Toman string", () => {
    const result = formatCurrency(1_234_567, "en");
    expect(result).not.toContain(".");
  });
});
