/**
 * One-time Digikala pet-category import, FACTS ONLY (owner decision 2026-11-12): name, brand, category, factual
 * specifications and weight become draft products; Digikala's price and stock are kept on the import record as a
 * reference only. Photos, descriptions and reviews are Digikala's/brands' content and are never read into the catalog —
 * opetlife writes its own copy and makes its own images.
 *
 * Source: the public JSON the Digikala website itself loads (api.digikala.com, which publishes no robots.txt). The
 * www robots.txt disallows query strings there, so pages are read from the API host only.
 */
export const DIGIKALA_FACTS_MODE = "DIGIKALA_FACTS";
export const DIGIKALA_FACTS_CATEGORY = "pet";
export const DIGIKALA_FACTS_HOSTS = ["api.digikala.com"];
/** Digikala's own "best-selling" order, so a capped run takes the products people actually buy. */
const BEST_SELLING_SORT = 7;

export const factsListUrl = (page: number) => `https://api.digikala.com/v1/categories/${DIGIKALA_FACTS_CATEGORY}/search/?page=${page}&sort=${BEST_SELLING_SORT}`;
export const factsDetailUrl = (id: string) => `https://api.digikala.com/v2/product/${id}/`;

export interface DigikalaListRef {
  id: string;
  referencePriceIrr: number | null;
  referenceStock: number | null;
  marketable: boolean;
}

export interface DigikalaFactsSnapshot {
  kind: "FACTS";
  sourceItemId: string;
  sourceUrl: string;
  title: string;
  titleEn: string | null;
  brandName: string | null;
  brandNameEn: string | null;
  categoryPath: string[];
  specifications: Array<{ label: string; value: string }>;
  weightKg: number | null;
  supportsDog: boolean;
  supportsCat: boolean;
  /** Reference only (Digikala's price/stock at import time); never a price on opetlife. */
  referencePriceIrr: number | null;
  referenceStock: number | null;
  marketable: boolean;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Plain, short text: tags stripped, whitespace folded, Persian/Arabic digits kept as written. */
export function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

const NO_BRAND = new Set(["متفرقه", "miscellaneous", "بدون برند", "no brand"]);

/** Weight in kg from a spec value or a title ("وزن 1 کیلوگرم", "۵۰۰ گرم", "2.5kg"); null when none is stated. */
export function parseWeightKg(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[٫,]/g, ".");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(کیلو\s*گرم|کیلوگرم|کیلو|kg|گرم|gr|g)(?![a-z])/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const grams = /^(گرم|gr|g)$/i.test(m[2]!.replace(/\s+/g, ""));
  const kg = grams ? value / 1000 : value;
  return kg > 0 && kg < 1000 ? Math.round(kg * 100) / 100 : null;
}

/** The product ids of one listing page, with the reference price/stock the listing shows. */
export function parseFactsList(body: unknown): { items: DigikalaListRef[]; totalPages: number } {
  const data = obj(obj(body)?.data);
  const items = arr(data?.products).flatMap((raw) => {
    const p = obj(raw);
    const id = p?.id;
    if (typeof id !== "number" && typeof id !== "string") return [];
    const price = obj(obj(p?.default_variant)?.price);
    return [{
      id: String(id),
      referencePriceIrr: num(price?.selling_price),
      referenceStock: num(price?.marketable_stock),
      marketable: p?.status === "marketable",
    }];
  });
  const totalPages = num(obj(data?.pager)?.total_pages) ?? 0;
  return { items, totalPages };
}

/** One product's facts from its detail JSON. Reads no images, descriptions, reviews, comments or seller data. */
export function parseFactsDetail(body: unknown, ref: DigikalaListRef): DigikalaFactsSnapshot | null {
  const p = obj(obj(obj(body)?.data)?.product);
  if (!p) return null;
  const title = clean(p.title_fa);
  if (!title) return null;
  const brand = obj(p.brand);
  const brandFa = clean(brand?.title_fa, 120);
  const brandEn = clean(brand?.title_en, 120);
  const unbranded = [brandFa, brandEn].some((b) => b && NO_BRAND.has(b.toLowerCase()));
  const categoryPath = arr(p.breadcrumb).map((b) => clean(obj(b)?.title, 80)).filter((t): t is string => !!t && t !== "دیجی‌کالا" && t !== title);
  const leafCategory = clean(obj(p.category)?.title_fa, 80);
  if (leafCategory && !categoryPath.includes(leafCategory)) categoryPath.push(leafCategory);

  const specifications: Array<{ label: string; value: string }> = [];
  for (const group of arr(p.specifications)) {
    for (const attr of arr(obj(group)?.attributes)) {
      const a = obj(attr);
      const label = clean(a?.title, 80);
      // Short factual attributes only: measured before any trimming, so prose is left out rather than cut.
      const values = arr(a?.values).map((v) => clean(v, 10_000)).filter((v): v is string => !!v);
      const value = values.join("، ");
      if (label && value && value.length <= 160 && !specifications.some((s) => s.label === label)) specifications.push({ label, value });
      if (specifications.length >= 30) break;
    }
  }
  const weightSpec = specifications.find((s) => s.label.includes("وزن"));
  const weightKg = parseWeightKg(weightSpec?.value) ?? parseWeightKg(title);
  const haystack = `${title} ${categoryPath.join(" ")}`;
  const dog = /سگ/.test(haystack);
  const cat = /گربه/.test(haystack);
  const sourceItemId = String(p.id ?? ref.id);
  return {
    kind: "FACTS",
    sourceItemId,
    sourceUrl: `https://www.digikala.com/product/dkp-${sourceItemId}/`,
    title,
    titleEn: clean(p.title_en),
    brandName: unbranded ? null : brandFa,
    brandNameEn: unbranded ? null : brandEn,
    categoryPath,
    specifications,
    weightKg,
    // A product that names neither species (a bowl, a carrier) is for both.
    supportsDog: dog || !cat,
    supportsCat: cat || !dog,
    referencePriceIrr: ref.referencePriceIrr,
    referenceStock: ref.referenceStock,
    marketable: ref.marketable,
  };
}
