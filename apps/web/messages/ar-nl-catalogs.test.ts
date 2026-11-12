import { describe, expect, it } from "vitest";
import en from "./en.json";
import ar from "./ar.json";
import nl from "./nl.json";

type Tree = { [key: string]: unknown };
function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((item, i) => leaves(item, `${path}[${i}]`));
  return Object.entries(node as Tree).flatMap(([key, value]) => leaves(value, path ? `${path}.${key}` : key));
}
const args = (s: string) => [...s.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]).sort();
const enLeaves = new Map(leaves(en));

/** Arabic and Dutch are full site languages (2026-11-12): complete catalogs, same ICU arguments, the right script. */
describe.each([["ar", ar], ["nl", nl]] as const)("%s catalog", (locale, catalog) => {
  const entries = leaves(catalog);
  it("translates every English key and nothing else", () => {
    expect(entries.map(([k]) => k).sort()).toEqual([...enLeaves.keys()].sort());
  });
  it("keeps every placeholder of the English message", () => {
    const broken = entries.filter(([k, v]) => args(v).join() !== args(enLeaves.get(k) ?? "").join()).map(([k]) => k);
    expect(broken).toEqual([]);
  });
  it("uses the language's own script", () => {
    const wrong = entries.filter(([, v]) => (locale === "ar" ? /[پچژگکی]/.test(v) : /[؀-ۿ]/.test(v))).map(([k]) => k);
    expect(wrong).toEqual([]);
  });
});
