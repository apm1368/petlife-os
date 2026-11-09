import { describe, expect, it } from "vitest";
import en from "./en.json";
import fa from "./fa.json";
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

const source = flatten(en.communityChat);
const placeholders = (value: string) => [...value.matchAll(/\{([\w]+)(?:[,}])/g)].map((match) => match[1]).sort();

describe("community chat locale parity", () => {
  it.each([["fa", fa.communityChat], ["de", de.communityChat], ["es", es.communityChat]] as const)("has matching keys and placeholders in %s", (locale, messages) => {
    const localized = flatten(messages);
    expect(Object.keys(localized).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(localized)) {
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source[key]!));
      if (locale === "de" || locale === "es") expect(value, `${locale}.${key}`).not.toMatch(/[\u0600-\u06ff]|\[Missing/);
    }
  });
});
