import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fa from "./fa.json";

type Tree = { [key: string]: string | Tree };
const flat = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => (typeof value === "string" ? { ...out, [`${prefix}${key}`]: value } : { ...out, ...flat(value, `${prefix}${key}.`) }), {});

const reference = flat(fa.externalTravel as Tree);

// Every Jajiga card renders these namespaces (source, pet policy, from-price, last seen, last sync, outbound CTA),
// so a key missing in one language shows a raw message id on that language's pages.
describe("external stays locale coverage", () => {
  it.each([["en", en.externalTravel], ["de", de.externalTravel], ["es", es.externalTravel]] as const)("defines every external-travel message in %s", (locale, messages) => {
    const keys = flat(messages as Tree);
    expect(Object.keys(keys).sort(), `${locale}.externalTravel keys`).toEqual(Object.keys(reference).sort());
    for (const [key, value] of Object.entries(keys)) {
      expect(value.trim(), `${locale}.externalTravel.${key}`).not.toBe("");
      expect(value, `${locale}.externalTravel.${key}`).not.toMatch(/[؀-ۿ]/);
    }
  });
});
