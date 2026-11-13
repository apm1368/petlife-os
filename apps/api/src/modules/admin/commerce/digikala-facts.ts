/**
 * One-time Digikala pet-category import, FACTS ONLY (owner decisions 2026-11-12 and 2026-11-13): name, brand, category,
 * factual specifications, weight and the variant facts (colour, size, flavour) become draft products; Digikala's price
 * and stock are kept on the import record as a reference only. Photos, descriptions and reviews are Digikala's/brands'
 * content and are never read into the catalog — opetlife writes its own copy and gets its own images.
 *
 * Scale (owner, 2026-11-13: about 16,000 products, once): Digikala serves at most 500 listing pages (10,000 products)
 * per category, so the run walks the pet category's sub-categories, each with a share of the total proportional to its
 * size, best-sellers first.
 *
 * Source: the public JSON the Digikala website itself loads (api.digikala.com, which publishes no robots.txt). The
 * www robots.txt disallows query strings there, so pages are read from the API host only.
 */
export const DIGIKALA_FACTS_MODE = "DIGIKALA_FACTS";
export const DIGIKALA_FACTS_CATEGORY = "pet";
export const DIGIKALA_FACTS_HOSTS = ["api.digikala.com"];
/** Digikala's own "best-selling" order, so a capped run takes the products people actually buy. */
const BEST_SELLING_SORT = 7;

/** Digikala answers at most this many listing pages per category, 20 products each. */
export const FACTS_SOURCE_MAX_PAGES = 500;
export const FACTS_PAGE_SIZE = 20;

export const factsListUrl = (page: number, category = DIGIKALA_FACTS_CATEGORY) => `https://api.digikala.com/v1/categories/${encodeURIComponent(category)}/search/?page=${page}&sort=${BEST_SELLING_SORT}`;
export const factsDetailUrl = (id: string) => `https://api.digikala.com/v2/product/${id}/`;

export interface DigikalaListRef {
  id: string;
  referencePriceIrr: number | null;
  referenceStock: number | null;
  marketable: boolean;
}

/** One opetlife variant: the variant facts Digikala lists (colour, size, flavour, weight), never seller or price data. */
export interface DigikalaFactsVariant {
  attributes: Record<string, string>;
  weightKg: number | null;
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
  /** At least one; several when Digikala lists the product in more than one colour, size, flavour or weight. */
  variants: DigikalaFactsVariant[];
  /** The Digikala sub-category the product was found in (traceability only). */
  subcategory: string | null;
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
export function parseFactsList(body: unknown): { items: DigikalaListRef[]; totalPages: number; totalItems: number } {
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
  const totalItems = num(obj(data?.pager)?.total_items) ?? 0;
  return { items, totalPages, totalItems };
}

export interface FactsSubcategory { code: string; title: string }
const CATEGORY_CODE = /^[a-z0-9][a-z0-9-]{1,79}$/;

/** The pet category's sub-categories, as the listing's own category filter names them. */
export function parseFactsSubcategories(body: unknown): FactsSubcategory[] {
  const options = arr(obj(obj(obj(obj(body)?.data)?.filters)?.categories)?.options);
  const seen = new Set<string>();
  return options.flatMap((raw) => {
    const o = obj(raw);
    const code = typeof o?.code === "string" ? o.code : null;
    if (!code || !CATEGORY_CODE.test(code) || seen.has(code)) return [];
    seen.add(code);
    return [{ code, title: clean(o?.title_fa, 80) ?? code }];
  });
}

export interface FactsPlanEntry {
  code: string;
  title: string;
  /** Products Digikala lists in this sub-category. */
  total: number;
  /** This sub-category's share of the run. */
  quota: number;
  taken: number;
  /** Next listing page to read. */
  page: number;
  exhausted: boolean;
}

/**
 * Splits `target` across sub-categories in proportion to their size (largest remainder), never giving one more than
 * it can serve (its size, and at most 500 pages of 20). Biggest first, so a stopped run has covered the most.
 */
export function planQuotas(subs: Array<{ code: string; title: string; total: number }>, target: number): FactsPlanEntry[] {
  const room = (s: { total: number }) => Math.max(0, Math.min(s.total, FACTS_SOURCE_MAX_PAGES * FACTS_PAGE_SIZE));
  const quota = new Map(subs.map((s) => [s.code, 0]));
  let left = Math.min(Math.max(0, Math.floor(target)), subs.reduce((n, s) => n + room(s), 0));
  while (left > 0) {
    const open = subs.filter((s) => quota.get(s.code)! < room(s));
    const weight = open.reduce((n, s) => n + s.total, 0);
    if (!open.length || weight <= 0) break;
    const shares = open.map((s) => {
      const exact = (left * s.total) / weight;
      const give = Math.min(room(s) - quota.get(s.code)!, Math.floor(exact));
      return { s, give, frac: exact - Math.floor(exact) };
    });
    let rest = left;
    for (const share of shares) { quota.set(share.s.code, quota.get(share.s.code)! + share.give); rest -= share.give; }
    for (const share of [...shares].sort((a, b) => b.frac - a.frac || b.s.total - a.s.total)) {
      if (rest <= 0) break;
      if (quota.get(share.s.code)! < room(share.s)) { quota.set(share.s.code, quota.get(share.s.code)! + 1); rest--; }
    }
    if (rest === left) break;
    left = rest;
  }
  return [...subs]
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))
    .map((s) => ({ code: s.code, title: s.title, total: s.total, quota: quota.get(s.code) ?? 0, taken: 0, page: 1, exhausted: false }));
}

/** Digikala's variant dimension names → the catalog's attribute keys (the same Persian keys the seeds use). */
function attributeKey(label: string | null, loose: boolean): string | null {
  if (!label) return null;
  const l = label.replace(/\u200c/g, "").trim().toLowerCase();
  if (["رنگ", "color", "colour"].includes(l)) return "رنگ";
  if (["سایز", "اندازه", "size"].includes(l)) return "اندازه";
  if (["طعم", "flavor", "flavour"].includes(l)) return "طعم";
  if (["وزن", "weight"].includes(l)) return "وزن";
  // A spec's other labels are not variant facts; a variant dimension Digikala names otherwise is kept if short.
  return loose && label.length <= 30 ? label : null;
}

/**
 * The product's variants by their facts only: one per distinct colour/size/flavour/weight combination Digikala lists
 * (several sellers of the same colour are one variant). A single-valued colour, size or flavour in the specifications
 * applies to every variant. Never reads seller, price, stock or image data. At most 30.
 */
export function parseFactsVariants(p: Json, specifications: Array<{ label: string; value: string }>, productWeightKg: number | null): DigikalaFactsVariant[] {
  const common: Record<string, string> = {};
  for (const spec of specifications) {
    const key = attributeKey(spec.label, false);
    if (key && key !== "وزن" && !common[key] && spec.value.length <= 60 && !/[،,]/.test(spec.value)) common[key] = spec.value;
  }
  const variants: DigikalaFactsVariant[] = [];
  const seen = new Set<string>();
  for (const raw of arr(p.variants)) {
    const v = obj(raw);
    if (!v) continue;
    const attributes: Record<string, string> = { ...common };
    let weightKg: number | null = null;
    for (const themeRaw of arr(v.themes)) {
      const theme = obj(themeRaw);
      const key = attributeKey(clean(theme?.label, 40), true);
      const value = clean(obj(theme?.value)?.title, 60);
      if (!key || !value) continue;
      attributes[key] = value;
      if (key === "وزن") weightKg = parseWeightKg(value);
    }
    const color = clean(obj(v.color)?.title, 60);
    if (color && !attributes["رنگ"]) attributes["رنگ"] = color;
    const signature = JSON.stringify(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(signature)) continue;
    seen.add(signature);
    variants.push({ attributes, weightKg: weightKg ?? productWeightKg });
    if (variants.length >= 30) break;
  }
  return variants.length ? variants : [{ attributes: common, weightKg: productWeightKg }];
}

/** One product's facts from its detail JSON. Reads no images, descriptions, reviews, comments or seller data. */
export function parseFactsDetail(body: unknown, ref: DigikalaListRef, subcategory: string | null = null): DigikalaFactsSnapshot | null {
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
    variants: parseFactsVariants(p, specifications, weightKg),
    subcategory,
    // A product that names neither species (a bowl, a carrier) is for both.
    supportsDog: dog || !cat,
    supportsCat: cat || !dog,
    referencePriceIrr: ref.referencePriceIrr,
    referenceStock: ref.referenceStock,
    marketable: ref.marketable,
  };
}
