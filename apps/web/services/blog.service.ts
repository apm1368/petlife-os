import type { ContentPlacementKey, Locale, PaginatedDto, PublicArticleDetailDto, PublicArticleSummaryDto, PublicCategoryDto, PublicContentPlacementDto, PublicTagDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ListBlogArticlesInput {
  categorySlug?: string;
  tagSlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** The public, anonymous-readable Blog surface (Handoff 15) — no session required, mirrors sellerFinanceService's own shape/conventions. */
export const blogService = {
  listArticles: (locale: Locale, input: ListBlogArticlesInput = {}) => apiFetch<PaginatedDto<PublicArticleSummaryDto>>(`/blog/articles${toQueryString({ locale, ...input })}`),
  getArticle: (locale: Locale, slug: string) => apiFetch<PublicArticleDetailDto>(`/blog/articles/${slug}${toQueryString({ locale })}`),
  listCategories: (locale: Locale) => apiFetch<PublicCategoryDto[]>(`/blog/categories${toQueryString({ locale })}`),
  getCategory: (locale: Locale, slug: string) => apiFetch<PublicCategoryDto>(`/blog/categories/${slug}${toQueryString({ locale })}`),
  listTags: (locale: Locale) => apiFetch<PublicTagDto[]>(`/blog/tags${toQueryString({ locale })}`),
  getTag: (locale: Locale, slug: string) => apiFetch<PublicTagDto>(`/blog/tags/${slug}${toQueryString({ locale })}`),
  getPlacement: (key: ContentPlacementKey, locale: Locale) => apiFetch<PublicContentPlacementDto>(`/content/placements/${key}${toQueryString({ locale })}`),
};
