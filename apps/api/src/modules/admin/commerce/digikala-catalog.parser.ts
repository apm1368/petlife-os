import { SourceFetchError, validateSourceUrl } from "../../travel-external/safe-fetch";

export type DigikalaProductSnapshot = {
  sourceItemId: string;
  sourceUrl: string;
  title: string;
  titleEn: string | null;
  brandName: string | null;
  sourceCategoryName: string | null;
  description: string | null;
  specifications: Array<{ label: string; value: string }>;
  images: Array<{ url: string; alt: string | null }>;
};

export type DigikalaPage = {
  products: DigikalaProductSnapshot[];
  productLinks: string[];
  nextPageUrl: string | null;
};

const HOSTS = ["digikala.com"];

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  return clean || null;
}

function strings(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.flatMap((v) => typeof v === "string" ? [v] : v && typeof v === "object" && "url" in v && typeof v.url === "string" ? [v.url] : []);
}

function isProduct(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const type = (value as Record<string, unknown>)["@type"];
  return type === "Product" || Array.isArray(type) && type.includes("Product");
}

function collectProducts(node: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 8 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const item of node) collectProducts(item, out, depth + 1); return; }
  if (isProduct(node)) out.push(node);
  for (const [key, child] of Object.entries(node)) if (key !== "offers") collectProducts(child, out, depth + 1);
}

function itemId(url: string, product?: Record<string, unknown>): string | null {
  const match = url.match(/\/product\/(?:dkp|dkpi)-(\d+)(?:\/|$)/i);
  if (match) return match[1]!;
  const sku = product?.sku ?? product?.productID ?? product?.gtin13 ?? product?.gtin;
  return typeof sku === "string" || typeof sku === "number" ? String(sku) : null;
}

function parseProduct(product: Record<string, unknown>, pageUrl: URL): DigikalaProductSnapshot | null {
  const rawUrl = typeof product.url === "string" ? product.url : pageUrl.toString();
  let canonical: URL;
  try { canonical = validateSourceUrl(new URL(rawUrl, pageUrl).toString(), HOSTS); } catch { return null; }
  const id = itemId(canonical.pathname, product);
  const title = text(product.name);
  if (!id || !title) return null;
  const brandRaw = product.brand;
  const brandName = typeof brandRaw === "string" ? text(brandRaw) : brandRaw && typeof brandRaw === "object" ? text((brandRaw as Record<string, unknown>).name) : null;
  const categories = strings(product.category);
  const props = Array.isArray(product.additionalProperty) ? product.additionalProperty : [];
  const specifications = props.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const label = text(row.name);
    const value = text(row.value);
    return label && value ? [{ label, value }] : [];
  });
  const images = strings(product.image).flatMap((raw) => {
    try {
      const imageUrl = validateSourceUrl(new URL(raw, pageUrl).toString(), HOSTS).toString();
      return [{ url: imageUrl, alt: text(product.name) }];
    } catch { return []; }
  });
  return {
    sourceItemId: id,
    sourceUrl: canonical.toString(),
    title,
    // No translation is invented. An English title is retained only if an explicit alternate name exists.
    titleEn: text(product.alternateName),
    brandName,
    sourceCategoryName: categories.at(-1) ?? null,
    description: text(product.description),
    specifications,
    images: [...new Map(images.map((image) => [image.url, image])).values()],
  };
}

/** Parse only public Schema.org Product JSON-LD. Never reads pricing, availability, seller or offer fields. */
export function parseDigikalaCatalogPage(html: string, pageUrl: string): DigikalaPage {
  const base = validateSourceUrl(pageUrl, HOSTS);
  const products: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectProducts(JSON.parse(match[1]!.replace(/^\s*<!--|-->\s*$/g, "")), products); } catch { /* malformed/untrusted page data is ignored */ }
  }
  const parsed = products.flatMap((product) => {
    const value = parseProduct(product, base);
    return value ? [value] : [];
  });
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = validateSourceUrl(new URL(match[1]!, base).toString(), HOSTS);
      if (/\/product\/(?:dkp|dkpi)-\d+(?:\/|$)/i.test(url.pathname) && !url.search) links.add(url.toString());
    } catch { /* external links and unsafe URLs are ignored */ }
  }
  let nextPageUrl: string | null = null;
  const next = html.match(/<link\b(?=[^>]*rel=["']next["'])[^>]*href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<a\b(?=[^>]*(?:rel|aria-label)=["'][^"']*(?:next|بعدی)[^"']*["'])[^>]*href=["']([^"']+)["']/i)?.[1];
  if (next) {
    try {
      const url = validateSourceUrl(new URL(next, base).toString(), HOSTS);
      if (!url.search) nextPageUrl = url.toString();
    } catch { /* a blocked/non-source pagination link ends the crawl */ }
  }
  return { products: parsed, productLinks: [...links], nextPageUrl };
}

export function canonicalDigikalaInput(raw: string): URL {
  let url: URL;
  try { url = validateSourceUrl(raw, HOSTS); } catch (e) {
    throw new Error(e instanceof SourceFetchError ? `Invalid Digikala URL (${e.category})` : "Invalid Digikala URL");
  }
  if (url.search || url.hash) throw new Error("Digikala import URLs with query strings or fragments are not accepted.");
  if (!/^\/(?:product\/(?:dkp|dkpi)-\d+|search\/category-[a-z0-9-]+)\/?$/i.test(url.pathname)) {
    throw new Error("Use a Digikala product URL or a clean category search URL.");
  }
  return url;
}
