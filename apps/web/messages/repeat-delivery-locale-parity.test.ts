import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fa from "./fa.json";

type Entry = [key: string, value: string];

function flatten(value: unknown, path = ""): Entry[] {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
}

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][\w]*)(?=\s*[,}])/g)].map((match) => match[1]).sort();

describe("repeat delivery locale coverage", () => {
  const source = flatten(en.commerce.repeat);
  const expected = source.map(([key]) => key).sort();

  it.each([["fa", fa.commerce.repeat], ["de", de.commerce.repeat], ["es", es.commerce.repeat]] as const)("keeps all application copy and placeholders in %s", (locale, messages) => {
    const translated = flatten(messages);
    expect(translated.map(([key]) => key).sort()).toEqual(expected);
    const values = new Map(translated);
    for (const [key, english] of source) {
      const value = values.get(key)!;
      expect(value, `${locale}.${key}`).toBeTruthy();
      expect(placeholders(value), `${locale}.${key} placeholders`).toEqual(placeholders(english));
      if (locale === "de" || locale === "es") expect(value, `${locale}.${key} Persian UI`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
