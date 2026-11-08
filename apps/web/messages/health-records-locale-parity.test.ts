import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

const placeholders = (message: string) =>
  [...message.matchAll(/\{([\w]+)(?:\s*,[^}]*)?\}/g)].map((match) => match[1]).sort();

describe("medical record, timeline and sharing German/Spanish catalog coverage", () => {
  it.each([["de", de], ["es", es]] as const)("keeps translated keys and placeholders complete for %s", (_locale, localized) => {
    for (const [scope, source, translated] of [
      ["healthAdvanced", en.healthAdvanced, localized.healthAdvanced],
      ["healthDepth", en.healthDepth, localized.healthDepth],
      ["healthShares", en.healthShares, localized.healthShares],
      ["rollout.records", en.rollout.records, localized.rollout.records],
    ] as const) {
      const base = flatten(source);
      const target = flatten(translated);
      expect(target.map(([key]) => key).sort(), scope).toEqual(base.map(([key]) => key).sort());
      for (const [key, message] of base) {
        const localizedMessage = target.find(([targetKey]) => targetKey === key)?.[1];
        expect(localizedMessage, `${scope}.${key}`).toBeTruthy();
        expect(placeholders(localizedMessage!), `${scope}.${key}`).toEqual(placeholders(message));
      }
    }
  });
});
