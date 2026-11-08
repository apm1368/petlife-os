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

describe("health and care German/Spanish message coverage", () => {
  it.each([
    ["de", de],
    ["es", es],
  ] as const)("matches the English health, care profile, and common keys for %s", (_locale, localized) => {
    for (const [scope, source] of [
      ["common", en.common],
      ["health", en.health],
      ["careCalendar", en.careCalendar],
      ["care.profile", en.care.profile],
    ] as const) {
      const base = flatten(source);
      const translated = flatten(scope === "care.profile" ? localized.care.profile : localized[scope]);
      expect(translated.map(([key]) => key).sort(), scope).toEqual(base.map(([key]) => key).sort());
      for (const [key, message] of base) {
        const localizedMessage = translated.find(([localizedKey]) => localizedKey === key)?.[1];
        expect(localizedMessage, `${scope}.${key}`).toBeTruthy();
        expect(placeholders(localizedMessage!), `${scope}.${key}`).toEqual(placeholders(message));
      }
    }
  });
});
