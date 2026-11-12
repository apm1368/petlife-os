import { cache } from "react";
import type { PaginatedDto, PublicArticleDetailDto, PublicArticleFeedItemDto, PublicArticleSlugRedirectDto, PublicArticleSummaryDto, PublicCategoryDto, PublicTagDto } from "@petlife/types";
import { locales, type RouteLocale } from "@/lib/i18n/config";

/**
 * Server-side reads of the public blog API, so article pages, indexes, the sitemap and llms.txt are
 * delivered as full HTML/text to search engines and AI crawlers (most of which do not run JavaScript).
 * `API_INTERNAL_ORIGIN` lets the server skip the public proxy; otherwise the public API origin is used.
 */
const SERVER_API_ORIGIN = process.env.API_INTERNAL_ORIGIN ?? process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";

/** Article slugs are lowercase ASCII words joined by single hyphens (the API enforces the same rule on write). */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

class UpstreamError extends Error {}

async function getJson<T>(path: string, init: { fresh?: boolean; revalidate?: number } = {}): Promise<T | null> {
  const response = await fetch(`${SERVER_API_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
    ...(init.fresh ? { cache: "no-store" as const } : { next: { revalidate: init.revalidate ?? 300 } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new UpstreamError(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export type ArticleLookup =
  | { kind: "found"; article: PublicArticleDetailDto }
  | { kind: "moved"; canonicalPath: string }
  | { kind: "missing" };

/**
 * One visible article locale, always fresh — publishing in the admin makes the URL live on the very next
 * request, and hiding it takes it down just as fast. A renamed article's old slug resolves to `moved`.
 * Upstream failures throw (a 5xx page), never a cached "not found".
 */
export const lookupArticle = cache(async (locale: RouteLocale, slug: string): Promise<ArticleLookup> => {
  if (!ARTICLE_SLUG_PATTERN.test(slug)) return { kind: "missing" };
  const article = await getJson<PublicArticleDetailDto>(`/blog/articles/${slug}${query({ locale })}`, { fresh: true });
  if (article) return { kind: "found", article };
  const moved = await getJson<PublicArticleSlugRedirectDto>(`/blog/slug-redirects/${slug}${query({ locale })}`, { fresh: true });
  if (moved) return { kind: "moved", canonicalPath: moved.canonicalPath };
  // A slug from another language (e.g. /de/blog/cat-scratching-furniture, shared or mistyped links): send the reader to
  // this article's own translation in the requested language. Without one, it stays a real 404.
  for (const other of locales) {
    if (other === locale) continue;
    const sibling = await getJson<PublicArticleDetailDto>(`/blog/articles/${slug}${query({ locale: other })}`, { fresh: true });
    if (!sibling) continue;
    const translation = sibling.translations?.find((t) => t.locale === locale);
    return translation ? { kind: "moved", canonicalPath: translation.canonicalPath } : { kind: "missing" };
  }
  return { kind: "missing" };
});

export const fetchRelatedArticles = cache(async (locale: RouteLocale, slug: string): Promise<PublicArticleSummaryDto[]> => {
  try {
    return (await getJson<PublicArticleSummaryDto[]>(`/blog/articles/${slug}/related${query({ locale })}`, { fresh: true })) ?? [];
  } catch {
    return [];
  }
});

export interface ArticleListInput {
  categorySlug?: string;
  tagSlug?: string;
  excludeCategorySlug?: string;
  page?: number;
  pageSize?: number;
}

export const fetchArticleList = cache(async (locale: RouteLocale, input: ArticleListInput): Promise<PaginatedDto<PublicArticleSummaryDto> | null> => {
  try {
    return await getJson<PaginatedDto<PublicArticleSummaryDto>>(`/blog/articles${query({ locale, ...input })}`, { fresh: true });
  } catch {
    return null;
  }
});

export const fetchCategories = cache(async (locale: RouteLocale): Promise<PublicCategoryDto[] | null> => {
  try {
    return await getJson<PublicCategoryDto[]>(`/blog/categories${query({ locale })}`, { revalidate: 120 });
  } catch {
    return null;
  }
});

export const fetchCategory = cache(async (locale: RouteLocale, slug: string): Promise<PublicCategoryDto | null> => {
  if (!ARTICLE_SLUG_PATTERN.test(slug)) return null;
  return getJson<PublicCategoryDto>(`/blog/categories/${slug}${query({ locale })}`, { revalidate: 120 });
});

export const fetchTag = cache(async (locale: RouteLocale, slug: string): Promise<PublicTagDto | null> => {
  if (!ARTICLE_SLUG_PATTERN.test(slug)) return null;
  return getJson<PublicTagDto>(`/blog/tags/${slug}${query({ locale })}`, { revalidate: 120 });
});

/** Every visible article locale for the sitemap, feeds and llms.txt — short revalidation so new articles appear within minutes. */
export async function fetchArticleFeed(options: { locale?: RouteLocale; withBody?: boolean } = {}): Promise<PublicArticleFeedItemDto[]> {
  try {
    return (await getJson<PublicArticleFeedItemDto[]>(`/blog/feed${query({ locale: options.locale, withBody: options.withBody ? "true" : undefined })}`, { revalidate: 300 })) ?? [];
  } catch {
    return [];
  }
}
