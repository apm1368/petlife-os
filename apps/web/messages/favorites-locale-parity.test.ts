import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fa from "./fa.json";

type Entry = [key: string, value: string];
function flatten(value: unknown, path = ""): Entry[] {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
}

describe("favorites locale coverage", () => {
  const sourceKeys = flatten(en.commerce.favorites).map(([key]) => key).sort();
  it.each([["fa", fa.commerce.favorites], ["de", de.commerce.favorites], ["es", es.commerce.favorites]] as const)("defines every favorites page state in %s", (locale, messages) => {
    const entries = flatten(messages);
    expect(entries.map(([key]) => key).sort()).toEqual(sourceKeys);
    for (const [key, value] of entries) {
      expect(value, `${locale}.${key}`).toBeTruthy();
      if (locale === "de" || locale === "es") expect(value, `${locale}.${key} must not contain Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
