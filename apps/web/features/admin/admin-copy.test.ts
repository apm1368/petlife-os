import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyFor, pickCopy } from "./admin-copy";
import { LEGACY_COPY } from "./admin-legacy-copy";

/** Pages that carry their copy inline as Persian/English pairs, translated to German and Spanish through the sheet. */
const PAGES = [
  "commerce/AdminCommerceViews.tsx",
  "travel/AdminTravelViews.tsx",
  "commerce/AdminCatalogImportsView.tsx",
  "commerce/AdminSellerCatalogRequestsView.tsx",
  "places/AdminPlacesView.tsx",
  "AdminHelpLegalView.tsx",
  "../admin-reviews/AdminReviewModerationView.tsx",
];
const STRING = String.raw`"(?:[^"\\]|\\.)*"`;

describe("admin inline copy", () => {
  it("picks Persian, English, or the German/Spanish sheet entry, falling back to English", () => {
    expect(pickCopy("fa", "سفارش‌ها", "Orders")).toBe("سفارش‌ها");
    expect(pickCopy("en", "سفارش‌ها", "Orders")).toBe("Orders");
    expect(pickCopy("de", "سفارش‌ها", "Orders")).toBe("Bestellungen");
    expect(pickCopy("es", "سفارش‌ها", "Orders")).toBe("Pedidos");
    expect(pickCopy("de", "متن تازه", "A sentence nobody translated")).toBe("A sentence nobody translated");
    expect(copyFor("es").trf("صفحه {page}", "Page {page}", { page: 3 })).toBe("Página 3");
    expect(copyFor("de")).toBe(copyFor("de"));
  });

  it("has a German and Spanish entry for every English string those pages show", () => {
    const pair = new RegExp(String.raw`\btrf?\(\s*(${STRING})\s*,\s*(${STRING})`, "g");
    const missing: string[] = [];
    for (const page of PAGES) {
      const source = readFileSync(join(__dirname, page), "utf8");
      expect(source).not.toMatch(/\bfa\s*\?\s*["`]/);
      for (const match of source.matchAll(pair)) {
        const english = JSON.parse(match[2]!) as string;
        if (!LEGACY_COPY[english]) missing.push(`${page}: ${english}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("never leaves an empty or Persian German/Spanish entry", () => {
    for (const [english, [de, es]] of Object.entries(LEGACY_COPY)) {
      expect(de.trim(), english).not.toBe("");
      expect(es.trim(), english).not.toBe("");
      expect(`${de}${es}`, english).not.toMatch(/[؀-ۿ]/);
    }
  });
});
