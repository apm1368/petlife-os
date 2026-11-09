import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") values.set(path, value);
    else for (const [child, text] of flatten(value, path)) values.set(child, text);
  }
  return values;
}

function placeholders(value: string) {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe("admin insurance locale coverage", () => {
  it.each([["de", de], ["es", es]] as const)("has complete %s interface keys and interpolation parity", (locale, catalog) => {
    for (const namespace of ["adminInsuranceProviders", "adminInsuranceProducts"] as const) {
      const source = flatten(en[namespace] as Tree);
      const translated = flatten(catalog[namespace] as Tree);
      expect([...translated.keys()].sort(), `${locale}.${namespace} keys`).toEqual([...source.keys()].sort());
      for (const [key, sourceText] of source) {
        const translatedText = translated.get(key)!;
        expect(placeholders(translatedText), `${locale}.${namespace}.${key} placeholders`).toEqual(placeholders(sourceText));
        expect(translatedText, `${locale}.${namespace}.${key}`).not.toMatch(/[\u0600-\u06ff]/);
      }
    }

    for (const namespace of ["verificationStatus", "coverageType"] as const) {
      const source = flatten(en.insurance[namespace] as Tree);
      const translated = flatten(catalog.insurance[namespace] as Tree);
      expect([...translated.keys()].sort(), `${locale}.insurance.${namespace} keys`).toEqual([...source.keys()].sort());
      for (const [key, sourceText] of source) {
        const translatedText = translated.get(key)!;
        expect(placeholders(translatedText), `${locale}.insurance.${namespace}.${key} placeholders`).toEqual(placeholders(sourceText));
        expect(translatedText, `${locale}.insurance.${namespace}.${key}`).not.toMatch(/[\u0600-\u06ff]/);
      }
    }
  });
});
