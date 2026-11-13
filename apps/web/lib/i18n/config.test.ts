import { describe, expect, it } from "vitest";
import { isAppLocale, isRouteLocale, localeDirection, locales } from "./config";

describe("locale config", () => {
  it("recognizes the six supported route locales", () => {
    expect(isAppLocale("fa")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(isAppLocale("es")).toBe(false);
    expect(isAppLocale("ar")).toBe(false);
    expect(isRouteLocale("de")).toBe(true);
    expect(isRouteLocale("es")).toBe(true);
    expect(isRouteLocale("ar")).toBe(true);
    expect(isRouteLocale("nl")).toBe(true);
    expect(isRouteLocale("tr")).toBe(false);
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

describe("locale prefix", () => {
  it("recognises every language, with or without a path, query or hash", async () => {
    const { LOCALE_PREFIX, hasLocalePrefix, stripLocalePrefix, locales } = await import("./config");
    for (const l of locales) {
      expect(hasLocalePrefix(`/${l}`)).toBe(true);
      expect(hasLocalePrefix(`/${l}/shop`)).toBe(true);
      expect(hasLocalePrefix(`/${l}?q=1`)).toBe(true);
      expect(stripLocalePrefix(`/${l}/pets/1`)).toBe("/pets/1");
    }
    expect(hasLocalePrefix("/arcade")).toBe(false);
    expect(hasLocalePrefix("/shop")).toBe(false);
    expect(LOCALE_PREFIX.test("/nl/profile")).toBe(true);
  });

  it("never double-prefixes an Arabic or Dutch link (/ar/ar/… was a 404)", async () => {
    const { localizeHref } = await import("@/features/navigation/localized-link");
    expect(localizeHref("/ar/pets/new", "ar")).toBe("/ar/pets/new");
    expect(localizeHref("/nl/shop?x=1", "nl")).toBe("/nl/shop?x=1");
    expect(localizeHref("/pets/new", "ar")).toBe("/ar/pets/new");
    expect(localizeHref("/uploads/a.png", "nl")).toBe("/uploads/a.png");
  });
});
