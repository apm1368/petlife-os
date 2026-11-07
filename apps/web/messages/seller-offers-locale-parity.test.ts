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

const placeholders = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();

describe("seller offer locale parity", () => {
  const source = flatten(en.seller.offers);
  const sourceKeys = source.map(([key]) => key).sort();

  it.each([["de", de.seller.offers], ["es", es.seller.offers]] as const)("translates all seller-offer UI keys and placeholders for %s", (locale, messages) => {
    const translated = flatten(messages);
    expect(translated.map(([key]) => key).sort()).toEqual(sourceKeys);
    const byKey = new Map(translated);

    for (const [key, sourceText] of source) {
      const translatedText = byKey.get(key)!;
      expect(translatedText, `${locale}.${key}`).toBeTruthy();
      expect(placeholders(translatedText), `${locale}.${key} placeholders`).toEqual(placeholders(sourceText));
      expect(translatedText, `${locale}.${key} contains no Persian interface text`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
