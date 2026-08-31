import { describe, expect, it } from "vitest";
import { isAppLocale, localeDirection, locales } from "./config";

describe("locale config", () => {
  it("recognizes fa and en as valid app locales", () => {
    expect(isAppLocale("fa")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
  });

  it("maps fa to rtl and en to ltr — the RTL/LTR shell contract", () => {
    expect(localeDirection.fa).toBe("rtl");
    expect(localeDirection.en).toBe("ltr");
  });

  it("only ships the two locales the product supports", () => {
    expect(locales).toEqual(["fa", "en"]);
  });
});
