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
const source = flatten({ shell: en.provider.shell, home: en.provider.home, bookingRow: en.provider.bookingRow, bookings: en.provider.bookings, bookingDetail: en.provider.bookingDetail });

describe("provider home and shell locale coverage", () => {
  it.each([["fa", fa.provider], ["de", de.provider], ["es", es.provider]] as const)("keeps provider shell and home keys/placeholders aligned in %s", (locale, messages) => {
    const localized = flatten({ shell: messages.shell, home: messages.home, bookingRow: messages.bookingRow, bookings: messages.bookings, bookingDetail: messages.bookingDetail });
    expect(Object.keys(localized).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(localized)) {
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source[key]!));
      if (locale === "de" || locale === "es") expect(value, `${locale}.${key}`).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
