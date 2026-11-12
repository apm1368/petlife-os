import { describe, expect, it } from "vitest";
import { isAppLocale, isRouteLocale, localeDirection, locales } from "./config";

describe("locale config", () => {
  it("recognizes the four supported route locales", () => {
    expect(isAppLocale("fa")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(isAppLocale("es")).toBe(false);
    expect(isAppLocale("ar")).toBe(false);
    expect(isRouteLocale("de")).toBe(true);
    expect(isRouteLocale("es")).toBe(true);
    expect(isRouteLocale("ar")).toBe(false);
  });

  it("keeps Persian RTL and the other shipped locales LTR", () => {
    expect(localeDirection.fa).toBe("rtl");
    expect(localeDirection.en).toBe("ltr");
    expect(localeDirection.de).toBe("ltr");
    expect(localeDirection.es).toBe("ltr");
  });

  it("declares Persian, English, German, Spanish, Arabic and Dutch route locales; Arabic is right-to-left", () => {
    expect(locales).toEqual(["fa", "en", "de", "es", "ar", "nl"]);
    expect(localeDirection.ar).toBe("rtl");
    expect(localeDirection.nl).toBe("ltr");
  });
});
