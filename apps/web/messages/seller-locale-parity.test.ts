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
const sellerScope = ["shell", "dashboard", "orders", "orderDetail", "inventory", "channels", "team", "settings", "finance"] as const;

describe("seller DE/ES catalog coverage", () => {
  it.each([["de", de.seller], ["es", es.seller]] as const)("translates seller operations and preserves placeholders for %s", (_locale, localized) => {
    for (const scope of sellerScope) {
      const base = flatten(en.seller[scope]);
      const translated = flatten(localized[scope]);
      expect(translated.map(([key]) => key).sort(), scope).toEqual(base.map(([key]) => key).sort());
      for (const [key, source] of base) {
        const target = translated.find(([targetKey]) => targetKey === key)?.[1];
        expect(target, `${scope}.${key}`).toBeTruthy();
        expect(placeholders(target!), `${scope}.${key}`).toEqual(placeholders(source));
      }
    }
  });
});
