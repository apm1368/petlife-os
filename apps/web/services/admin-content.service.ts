import type {
  AdminArticleDto,
  AdminArticleListItemDto,
  AdminArticleLocaleDto,
  AdminContentPlacementDto,
  ArticleLifecycleStatus,
  CategoryDto,
  ContentAuthorDto,
  ContentPlacementKey,
  ContentVersionDetailDto,
  ContentVersionSummaryDto,
  Locale,
  MediaAssetDto,
  PaginatedDto,
  TagDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ListArticlesInput {
  search?: string;
  status?: ArticleLifecycleStatus;
  locale?: Locale;
  categoryId?: string;
  authorId?: string;
  page?: number;
  pageSize?: number;
}

export interface SaveArticleLocaleInput {
  title: string;
  slug: string;
  excerpt?: string;
  body: unknown[];
  seoTitle?: string;
  seoDescription?: string;
  changeNote?: string;
}

export interface CategoryLocaleInput {
  locale: Locale;
  name: string;
  slug: string;
  description?: string;
}

export interface TagLocaleInput {
  locale: Locale;
  name: string;
  slug: string;
}

export interface ContentBlockInput {
  sortOrder: number;
  linkedArticleId?: string;
  mediaAssetId?: string;
  locales: { locale: Locale; heading?: string; body?: string; ctaLabel?: string; ctaHref?: string }[];
}

/** The Handoff 15 Admin CMS surface — Articles/Categories/Tags/Authors/Media/Placements, all under `/admin/content`. */
export const adminContentService = {
  listArticles: (input: ListArticlesInput = {}) => apiFetch<PaginatedDto<AdminArticleListItemDto>>(`/admin/content/articles${toQueryString({ ...input })}`),
  getArticle: (id: string) => apiFetch<AdminArticleDto>(`/admin/content/articles/${id}`),
  createArticle: (input: { locale: Locale; authorId?: string; categoryId?: string; coverMediaAssetId?: string; tagIds?: string[] } & SaveArticleLocaleInput) =>
    apiFetch<AdminArticleDto>("/admin/content/articles", { method: "POST", body: input }),
  updateArticle: (id: string, input: { authorId?: string | null; categoryId?: string | null; coverMediaAssetId?: string | null; tagIds?: string[] }) =>
    apiFetch<AdminArticleDto>(`/admin/content/articles/${id}`, { method: "PATCH", body: input }),
  getArticleLocale: (id: string, locale: Locale) => apiFetch<AdminArticleLocaleDto>(`/admin/content/articles/${id}/locales/${locale}`),
  saveArticleLocale: (id: string, locale: Locale, input: SaveArticleLocaleInput) => apiFetch<AdminArticleLocaleDto>(`/admin/content/articles/${id}/locales/${locale}`, { method: "PUT", body: input }),
  publishArticleLocale: (id: string, locale: Locale) => apiFetch<AdminArticleLocaleDto>(`/admin/content/articles/${id}/locales/${locale}/publish`, { method: "POST" }),
  hideArticleLocale: (id: string, locale: Locale) => apiFetch<AdminArticleLocaleDto>(`/admin/content/articles/${id}/locales/${locale}/hide`, { method: "POST" }),
  archiveArticleLocale: (id: string, locale: Locale) => apiFetch<AdminArticleLocaleDto>(`/admin/content/articles/${id}/locales/${locale}/archive`, { method: "POST" }),

  listVersions: (id: string, locale: Locale) => apiFetch<ContentVersionSummaryDto[]>(`/admin/content/articles/${id}/locales/${locale}/versions`),
  getVersion: (versionId: string) => apiFetch<ContentVersionDetailDto>(`/admin/content/content-versions/${versionId}`),
  restoreVersion: (versionId: string) => apiFetch<AdminArticleLocaleDto>(`/admin/content/content-versions/${versionId}/restore`, { method: "POST" }),

  listCategories: () => apiFetch<CategoryDto[]>("/admin/content/categories"),
  createCategory: (locales: CategoryLocaleInput[]) => apiFetch<CategoryDto>("/admin/content/categories", { method: "POST", body: { locales } }),
  updateCategory: (id: string, locales: CategoryLocaleInput[]) => apiFetch<CategoryDto>(`/admin/content/categories/${id}`, { method: "PATCH", body: { locales } }),

  listTags: () => apiFetch<TagDto[]>("/admin/content/tags"),
  createTag: (locales: TagLocaleInput[]) => apiFetch<TagDto>("/admin/content/tags", { method: "POST", body: { locales } }),
  updateTag: (id: string, locales: TagLocaleInput[]) => apiFetch<TagDto>(`/admin/content/tags/${id}`, { method: "PATCH", body: { locales } }),

  listAuthors: () => apiFetch<ContentAuthorDto[]>("/admin/content/authors"),
  createAuthor: (input: { name: string; bio?: string; avatarMediaAssetId?: string }) => apiFetch<ContentAuthorDto>("/admin/content/authors", { method: "POST", body: input }),
  updateAuthor: (id: string, input: { name?: string; bio?: string; avatarMediaAssetId?: string }) => apiFetch<ContentAuthorDto>(`/admin/content/authors/${id}`, { method: "PATCH", body: input }),

  requestMediaUpload: (contentType: string) =>
    apiFetch<{ uploadUrl: string; method: "PUT"; publicUrl: string; headers?: Record<string, string>; expiresInSeconds: number; key: string }>("/admin/content/media/upload-url", { method: "POST", body: { contentType } }),
  confirmMediaUpload: (input: { key: string; url: string; mimeType: string; fileSizeBytes: number; altText?: string; widthPx?: number; heightPx?: number }) =>
    apiFetch<MediaAssetDto>("/admin/content/media", { method: "POST", body: input }),
  listMedia: (page = 1, pageSize = 30) => apiFetch<PaginatedDto<MediaAssetDto>>(`/admin/content/media${toQueryString({ page, pageSize })}`),
  updateMediaMetadata: (id: string, input: { altText?: string; widthPx?: number; heightPx?: number }) => apiFetch<MediaAssetDto>(`/admin/content/media/${id}`, { method: "PATCH", body: input }),
  disableMedia: (id: string) => apiFetch<MediaAssetDto>(`/admin/content/media/${id}/disable`, { method: "POST" }),

  listPlacements: () => apiFetch<AdminContentPlacementDto[]>("/admin/content/placements"),
  getPlacement: (key: ContentPlacementKey) => apiFetch<AdminContentPlacementDto>(`/admin/content/placements/${key}`),
  replacePlacementBlocks: (key: ContentPlacementKey, blocks: ContentBlockInput[]) => apiFetch<AdminContentPlacementDto>(`/admin/content/placements/${key}`, { method: "PUT", body: { blocks } }),
};
