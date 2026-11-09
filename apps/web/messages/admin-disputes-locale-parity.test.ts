import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

const flatten = (value: unknown, path = ""): Array<[string, string]> => {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
};
const placeholders = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();

describe("admin dispute locale parity", () => {
  const baseline = flatten(en.admin.disputes);

  it.each([["de", de.admin.disputes], ["es", es.admin.disputes]] as const)("translates every dispute queue/detail key in %s", (locale, messages) => {
    const translated = flatten(messages);
    expect(translated.map(([key]) => key).sort()).toEqual(baseline.map(([key]) => key).sort());
    const values = new Map(translated);
    for (const [key, source] of baseline) {
      expect(values.get(key), `${locale}.${key}`).toBeTruthy();
      expect(placeholders(values.get(key)!)).toEqual(placeholders(source));
      expect(values.get(key), `${locale}.${key} contains Persian UI`).not.toMatch(/[\u0600-\u06ff]/);
    }
  });
});
