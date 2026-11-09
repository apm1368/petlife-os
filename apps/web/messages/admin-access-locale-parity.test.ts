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

const placeholders = (text: string) => [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();

describe("admin access locale catalog", () => {
  it.each([["de", de], ["es", es]] as const)("has complete %s copy and interpolation parity without Persian UI", (locale, catalog) => {
    const source = flatten(en.adminAccess as Tree);
    const translated = flatten(catalog.adminAccess as Tree);
    expect([...translated.keys()].sort(), `${locale} keys`).toEqual([...source.keys()].sort());
    for (const [key, text] of source) {
      const translatedText = translated.get(key)!;
      expect(placeholders(translatedText), `${locale}.${key}`).toEqual(placeholders(text));
      expect(translatedText, `${locale}.${key}`).not.toMatch(/[\u0600-\u06ff]/);
    }
  });
});
