import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

interface MessageTree {
  [key: string]: string | MessageTree;
}

function entries(tree: MessageTree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [child, text] of entries(value, path)) result.set(child, text);
  }
  return result;
}

function placeholders(text: string) {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe("admin settings locale catalog", () => {
  it.each([["de", de], ["es", es]] as const)("has complete %s keys and placeholders without Persian UI", (locale, catalog) => {
    const english = entries(en.adminSettings as MessageTree);
    const translated = entries(catalog.adminSettings as MessageTree);
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, source] of english) {
      const value = translated.get(key)!;
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source));
      expect(value, `${locale}.${key}`).not.toMatch(/[\u0600-\u06ff]/);
    }
  });
});
