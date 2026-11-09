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

const placeholders = (value: string) => [...value.matchAll(/\{([\w]+)(?:[,}])/g)].map((match) => match[1]).sort();

describe("seller and clinical dashboard locale catalogs", () => {
  const definitions = [
    { name: "seller dashboard", source: en.seller.dashboard, catalogs: { fa: fa.seller.dashboard, de: de.seller.dashboard, es: es.seller.dashboard } },
    { name: "clinical dashboard", source: en.vetPanel.dashboard, catalogs: { fa: fa.vetPanel.dashboard, de: de.vetPanel.dashboard, es: es.vetPanel.dashboard } },
  ] as const;

  for (const definition of definitions) {
    const source = flatten(definition.source);
    it.each(Object.entries(definition.catalogs))(`${definition.name} has key and placeholder parity in %s`, (locale, value) => {
      const catalog = flatten(value);
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(source).sort());
      for (const [key, text] of Object.entries(source)) expect(placeholders(catalog[key]!)).toEqual(placeholders(text));
      if (locale === "de" || locale === "es") {
        for (const [key, text] of Object.entries(catalog)) expect(text, `${definition.name}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
      }
    });
  }
});
