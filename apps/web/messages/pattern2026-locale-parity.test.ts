import { describe, expect, it } from "vitest";
import fa from "./fa.json";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

/**
 * The 2026-11 pattern copy (docs/design/pattern-2026-11: landing, section reels, park/hero, member frame) lives
 * only in the message catalogs. Every language must carry the same tree — same keys, same array lengths — and
 * the same {placeholders}, so no page renders a missing string or an unfilled variable in any language.
 */
const catalogs = { fa: fa.pattern2026, en: en.pattern2026, de: de.pattern2026, es: es.pattern2026 };

function leaves(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  throw new Error(`${path} is not text`);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("2026-11 pattern copy in the message catalogs", () => {
  const reference = new Map(leaves(catalogs.fa));

  it.each(["en", "de", "es"] as const)("%s has exactly the Persian tree", (locale) => {
    expect(leaves(catalogs[locale]).map(([path]) => path).sort()).toEqual([...reference.keys()].sort());
  });

  it.each(["fa", "en", "de", "es"] as const)("%s strings carry the same placeholders as Persian and are not blank", (locale) => {
    for (const [path, text] of leaves(catalogs[locale])) {
      expect(placeholders(text), `${locale} ${path}`).toBe(placeholders(reference.get(path) ?? ""));
      // The landing reel's closing chapter is intentionally unlabeled.
      if (path !== "opl.scenes.k[9]") expect(text.trim(), `${locale} ${path}`).not.toBe("");
    }
  });

  it.each(["en", "de", "es"] as const)("%s copy contains no Persian script", (locale) => {
    expect(leaves(catalogs[locale]).filter(([, text]) => /[؀-ۿ]/.test(text))).toEqual([]);
  });

  it("writes the Persian brand as «اپت لایف»", () => {
    expect(catalogs.fa.opl.brand).toBe("اپت لایف");
    expect(leaves(catalogs.fa).filter(([, text]) => /opetlife/i.test(text))).toEqual([]);
  });
});
