import { describe, expect, it } from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

const flatten = (value: unknown, prefix = "", result: Record<string, string> = {}) => {
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result[path] = child;
    else flatten(child, path, result);
  }
  return result;
};

const placeholders = (value: string) => [...value.matchAll(/\{([\w]+)(?:[,}])/g)].map((match) => match[1]).sort();

describe("pet memories locale catalogs", () => {
  const source = flatten(en.memories);
  const catalogs = { de: flatten(de.memories), es: flatten(es.memories) };

  it.each(Object.entries(catalogs))("translates every memories key and keeps placeholders in %s", (locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort());
    for (const [key, englishText] of Object.entries(source)) {
      expect(placeholders(catalog[key]!)).toEqual(placeholders(englishText));
      expect(catalog[key], `${locale}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
