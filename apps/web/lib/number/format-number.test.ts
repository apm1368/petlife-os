import { describe, expect, it } from "vitest";
import { countryName, formatCount } from "./format-number";

describe("locale-aware number and country display", () => {
  it("uses each interface locale convention while retaining Persian digits", () => {
    expect(formatCount(1250, "fa")).toBe("۱٬۲۵۰");
    expect(formatCount(1250, "en")).toBe("1,250");
    expect(formatCount(1250, "de")).toBe("1.250");
    expect(formatCount(1250, "es")).toBe("1250");
    expect(formatCount(1250, "nl")).toBe("1.250");
    expect(formatCount(1250, "ar")).toBe("1,250");
  });

  it("formats country names in the selected language", () => {
    expect(countryName("DE", "de")).toBe("Deutschland");
    expect(countryName("ES", "es")).toBe("España");
    expect(countryName("IR", "ar")).toBe("إيران");
    expect(countryName("DE", "nl")).toBe("Duitsland");
  });
});
