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

function placeholders(value: string) {
  return [...value.matchAll(/\{([\w]+)(?:[,}])/g)].map((match) => match[1]).sort();
}

describe("lost-pet locale catalogs", () => {
  const catalogs = { fa: flatten(fa.lostPet), de: flatten(de.lostPet), es: flatten(es.lostPet) };
  const english = flatten(en.lostPet);
  const navCatalogs = { fa: flatten(fa.adminAnimalSupportNav), de: flatten(de.adminAnimalSupportNav), es: flatten(es.adminAnimalSupportNav) };
  const englishNav = flatten(en.adminAnimalSupportNav);

  it.each(Object.entries(catalogs))("has complete keys and placeholders for %s", (_locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(english)) {
      expect(placeholders(catalog[key]!)).toEqual(placeholders(text));
    }
  });

  it.each(["de", "es"] as const)("contains no Persian fallback in %s", (locale) => {
    for (const [key, text] of Object.entries(catalogs[locale])) {
      expect(text, key).not.toMatch(/[\u0600-\u06FF]/);
    }
  });

  it.each(Object.entries(navCatalogs))("has complete animal-support navigation keys and no Persian UI in %s", (locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(englishNav).sort());
    if (locale === "de" || locale === "es") {
      for (const [key, text] of Object.entries(catalog)) expect(text, key).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
