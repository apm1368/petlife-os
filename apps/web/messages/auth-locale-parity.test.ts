import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

const placeholders = (message: string) => [...message.matchAll(/\{([\w]+)(?:\s*,[^}]*)?\}/g)].map((match) => match[1]).sort();

describe("DE/ES auth message coverage", () => {
  it.each([["de", de.auth], ["es", es.auth]] as const)("translates every English auth key and keeps its placeholders for %s", (_locale, localized) => {
    const base = flatten(en.auth);
    const translated = flatten(localized);
    expect(translated.map(([key]) => key)).toEqual(base.map(([key]) => key));
    for (const [key, source] of base) {
      const target = translated.find(([targetKey]) => targetKey === key)?.[1];
      expect(target, key).toBeTruthy();
      expect(placeholders(target!)).toEqual(placeholders(source));
    }
  });
});
