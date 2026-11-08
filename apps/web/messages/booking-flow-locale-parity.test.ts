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

describe("booking flow translation coverage", () => {
  const source = flatten(en.bookingFlow);
  const expectedKeys = source.map(([key]) => key).sort();

  it.each([["de", de.bookingFlow], ["es", es.bookingFlow]] as const)("covers every booking-flow state and placeholder in %s without Persian UI", (locale, messages) => {
    const translated = flatten(messages);
    expect(translated.map(([key]) => key).sort()).toEqual(expectedKeys);
    const values = new Map(translated);
    for (const [key, english] of source) {
      const localized = values.get(key)!;
      expect(localized, `${locale}.${key}`).toBeTruthy();
      expect(placeholders(localized), `${locale}.${key} placeholders`).toEqual(placeholders(english));
      expect(localized, `${locale}.${key} contains no Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
