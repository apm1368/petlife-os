import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

type Entry = [key: string, value: string];

function flatten(value: unknown, path = ""): Entry[] {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
}

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][\w]*)(?=\s*[,}])/g)].map((match) => match[1]).sort();

describe("checkout translation coverage", () => {
  const source = flatten(en.commerce.checkout);
  const sourceKeys = source.map(([key]) => key).sort();

  it.each([["de", de.commerce.checkout], ["es", es.commerce.checkout]] as const)("covers every checkout state and placeholder in %s", (locale, messages) => {
    const translated = flatten(messages);
    expect(translated.map(([key]) => key).sort()).toEqual(sourceKeys);
    const values = new Map(translated);

    for (const [key, english] of source) {
      const localized = values.get(key)!;
      expect(localized, `${locale}.${key}`).toBeTruthy();
      expect(placeholders(localized), `${locale}.${key} placeholders`).toEqual(placeholders(english));
      expect(localized, `${locale}.${key} contains no Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });

  it.each([["de", de.common], ["es", es.common]] as const)("provides the shared UI keys used by application routes in %s", (locale, messages) => {
    const sourceCommon = flatten(en.common);
    const translatedCommon = flatten(messages);
    expect(translatedCommon.map(([key]) => key).sort()).toEqual(sourceCommon.map(([key]) => key).sort());
    const values = new Map(translatedCommon);
    for (const [key, english] of sourceCommon) {
      const localized = values.get(key)!;
      expect(localized, `${locale}.common.${key}`).toBeTruthy();
      expect(placeholders(localized), `${locale}.common.${key} placeholders`).toEqual(placeholders(english));
      if (key !== "appName") expect(localized, `${locale}.common.${key} contains no Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("order journey translation coverage", () => {
  it.each(["confirmation", "myOrders", "orderDetail", "statusLabels"] as const)("has complete German and Spanish %s copy with matching placeholders and no Persian", (namespace) => {
    const source = flatten(en.commerce[namespace]);
    for (const [locale, catalog] of [["de", de], ["es", es]] as const) {
      const translated = flatten(catalog.commerce[namespace]);
      expect(translated.map(([key]) => key).sort(), `${locale}.${namespace} keys`).toEqual(source.map(([key]) => key).sort());
      const values = new Map(translated);
      for (const [key, english] of source) {
        const localized = values.get(key)!;
        expect(localized, `${locale}.${namespace}.${key}`).toBeTruthy();
        expect(placeholders(localized), `${locale}.${namespace}.${key} placeholders`).toEqual(placeholders(english));
        expect(localized, `${locale}.${namespace}.${key} contains no Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
      }
    }
  });
});
