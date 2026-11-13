import type { RouteLocale } from "@/lib/i18n/config";
import type { BuiltinLegalSlug } from "@/lib/legal/builtin";

const SERVER_API_ORIGIN = process.env.API_INTERNAL_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";

/** Admin-published legal documents and help articles exist in Persian and English only. */
const EDITORIAL_LOCALES = new Set<RouteLocale>(["fa", "en"]);

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${SERVER_API_ORIGIN}${path}`, { headers: { accept: "application/json" }, next: { revalidate: 300 }, signal: AbortSignal.timeout(3_000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * True when the owner has published this document for exactly this language in Admin → Help center → Legal.
 * That version then replaces the built-in draft. Any failure (API slow or down) keeps the built-in text, so
 * the page never goes blank.
 */
export async function hasPublishedLegalDocument(slug: BuiltinLegalSlug, locale: RouteLocale): Promise<boolean> {
  if (!EDITORIAL_LOCALES.has(locale)) return false;
  const doc = await getJson<{ available?: boolean; body?: string | null; locale?: string }>(`/legal/${slug}?locale=${locale}`);
  return Boolean(doc?.available && doc.body && doc.locale === locale);
}

/** FAQ articles the team publishes in the help center (fa/en), listed under the built-in answers. */
export async function fetchPublishedFaqArticles(locale: RouteLocale): Promise<{ slug: string; title: string }[]> {
  if (!EDITORIAL_LOCALES.has(locale)) return [];
  const items = await getJson<{ slug: string; title: string }[]>(`/help/articles?locale=${locale}&faq=true`);
  return Array.isArray(items) ? items.filter((a) => a.slug && a.title).map((a) => ({ slug: a.slug, title: a.title })) : [];
}
