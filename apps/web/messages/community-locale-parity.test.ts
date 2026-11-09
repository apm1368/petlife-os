import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

function flatten(value: unknown, prefix = "", result: Record<string, string> = {}) {
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result[path] = child;
    else flatten(child, path, result);
  }
  return result;
}

const source = flatten({ feed: en.community.feed, postType: en.community.postType });
const placeholders = (value: string) => [...value.matchAll(/\{([\w]+)(?:[,}])/g)].map((match) => match[1]).sort();

describe("community feed locale coverage", () => {
  it.each([["de", de.community], ["es", es.community]] as const)("keeps feed keys and placeholders complete in %s", (locale, messages) => {
    const localized = flatten({ feed: messages.feed, postType: messages.postType });
    expect(Object.keys(localized).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(localized)) {
      expect(value, `${locale}.${key}`).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source[key]!));
    }
  });
});
