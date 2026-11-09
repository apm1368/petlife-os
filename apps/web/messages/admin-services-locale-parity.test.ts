import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

type Tree = { [key: string]: string | Tree };
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [child, text] of flatten(value, path)) result.set(child, text);
  }
  return result;
}
const placeholders = (value: string) => [...value.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();

describe("admin services locale coverage", () => {
  it.each([["fa", fa], ["de", de], ["es", es]] as const)("has complete %s keys and interpolation parity", (locale, messages) => {
    const source = flatten(en.adminServices as Tree);
    const translated = flatten(messages.adminServices as Tree);
    expect([...translated.keys()].sort(), `${locale} keys`).toEqual([...source.keys()].sort());
    for (const [key, text] of source) {
      const actual = translated.get(key)!;
      expect(placeholders(actual), `${locale}.${key} placeholders`).toEqual(placeholders(text));
      if (locale !== "fa") expect(actual, `${locale}.${key} must not contain Persian UI text`).not.toMatch(/[\u0600-\u06ff]/);
    }

    const accessSource = flatten(en.adminServiceAccess as Tree);
    const accessTranslated = flatten(messages.adminServiceAccess as Tree);
    expect([...accessTranslated.keys()].sort(), `${locale} access keys`).toEqual([...accessSource.keys()].sort());
    for (const [key, text] of accessSource) {
      const actual = accessTranslated.get(key)!;
      expect(placeholders(actual), `${locale}.adminServiceAccess.${key} placeholders`).toEqual(placeholders(text));
      if (locale !== "fa") expect(actual, `${locale}.adminServiceAccess.${key} must not contain Persian UI text`).not.toMatch(/[\u0600-\u06ff]/);
    }
  });
});
