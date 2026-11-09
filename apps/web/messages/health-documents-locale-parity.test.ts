import { describe, expect, it } from "vitest";
import en from "./en.json";
import fa from "./fa.json";
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

describe("medical document detail locale catalogs", () => {
  const source = flatten(en.healthAdvanced.documents);
  const catalogs = {
    fa: flatten(fa.healthAdvanced.documents),
    de: flatten(de.healthAdvanced.documents),
    es: flatten(es.healthAdvanced.documents),
  };

  it.each(Object.entries(catalogs))("covers every document UI key and placeholder in %s", (locale, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort());
    for (const [key, text] of Object.entries(source)) {
      expect(placeholders(catalog[key]!)).toEqual(placeholders(text));
    }
    if (locale === "de" || locale === "es") {
      for (const [key, text] of Object.entries(catalog)) expect(text, `${locale}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });

  it.each(["de", "es"] as const)("covers document correction actions without Persian UI in %s", (locale) => {
    const catalog = flatten(locale === "de" ? de.rollout.records : es.rollout.records);
    const sourceRecords = flatten(en.rollout.records);
    const pageKeys = ["correction", "providerLocked", "reason", "save", "cancel", "failedSave", "correctionSaved", "retractDocument", "retractHint"];
    for (const key of pageKeys) {
      expect(catalog[key], `${locale}.rollout.records.${key}`).toBeTruthy();
      expect(placeholders(catalog[key]!)).toEqual(placeholders(sourceRecords[key]!));
      expect(catalog[key]).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
