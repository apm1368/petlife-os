import { Injectable } from "@nestjs/common";
import { ArticleLifecycleStatus, Locale, Prisma } from "@prisma/client";
import type { PaginatedDto, PublicArticleDetailDto, PublicArticleReferenceDto, PublicArticleSummaryDto, PublicCategoryDto, PublicTagDto, RichTextDocument } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ArticleLocaleNotFoundException, CategoryNotFoundException, TagNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";
import { CONTENT_AUTHOR_INCLUDE, MEDIA_ASSET_INCLUDE, resolveRichTextMedia, toContentAuthorDto, toMediaAssetDto, toPublicCategoryDto, toPublicTagDto } from "./content-mapper";

function articleInclude(locale: Locale) {
  return {
    author: { include: CONTENT_AUTHOR_INCLUDE },
    category: { include: { locales: { where: { locale } } } },
    coverMediaAsset: { include: MEDIA_ASSET_INCLUDE },
    tags: { include: { tag: { include: { locales: { where: { locale } } } } } },
  } as const;
}

type PublicArticleLocaleRow = Prisma.ArticleLocaleGetPayload<{ include: { article: { include: ReturnType<typeof articleInclude> } } }>;

function canonicalPath(locale: Locale, slug: string): string {
  return `/${locale}/blog/${slug}`;
}

function toSummary(row: PublicArticleLocaleRow): PublicArticleSummaryDto {
  const { article } = row;
  return {
    id: article.id,
    locale: row.locale as unknown as PublicArticleSummaryDto["locale"],
    slug: row.slug,
    canonicalPath: canonicalPath(row.locale, row.slug),
    title: row.title,
    excerpt: row.excerpt,
    coverMediaAsset: article.coverMediaAsset ? toMediaAssetDto(article.coverMediaAsset) : null,
    author: article.author ? toContentAuthorDto(article.author) : null,
    category: article.category?.locales[0] ? toPublicCategoryDto(article.category.locales[0]) : null,
    tags: article.tags.map((t) => t.tag.locales[0]).filter((l): l is NonNullable<typeof l> => Boolean(l)).map(toPublicTagDto),
    publishedAt: row.publishedAt!.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReference(row: PublicArticleLocaleRow): PublicArticleReferenceDto {
  const summary = toSummary(row);
  return { id: summary.id, locale: summary.locale, slug: summary.slug, canonicalPath: summary.canonicalPath, title: summary.title, excerpt: summary.excerpt, coverMediaAsset: summary.coverMediaAsset };
}

export interface ListPublicArticlesQuery extends PaginationQueryDto {
  categorySlug?: string;
  tagSlug?: string;
  search?: string;
}

/**
 * Public read-only content API (spec: "public API must return only
 * publicly visible localized content"). Every query here filters on
 * `status: VISIBLE` at the database level — there is no separate
 * "is this safe to show" check layered on afterward, so a DRAFT/HIDDEN/
 * ARCHIVED locale can never leak through this service by omission. A
 * requested article that exists but isn't VISIBLE in this locale throws
 * the exact same ArticleLocaleNotFoundException as one that doesn't exist
 * at all (mirrors SupportCase's own "404 for both not-found and
 * not-yours" precedent) — an anonymous caller can never distinguish
 * "never existed" from "exists but is a draft."
 */
@Injectable()
export class PublicContentReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listArticles(locale: Locale, query: ListPublicArticlesQuery): Promise<PaginatedDto<PublicArticleSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.ArticleLocaleWhereInput = {
      locale,
      status: ArticleLifecycleStatus.VISIBLE,
      title: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
      article: {
        category: query.categorySlug ? { locales: { some: { locale, slug: query.categorySlug } } } : undefined,
        tags: query.tagSlug ? { some: { tag: { locales: { some: { locale, slug: query.tagSlug } } } } } : undefined,
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.articleLocale.findMany({ where, include: { article: { include: articleInclude(locale) } }, orderBy: { publishedAt: "desc" }, skip, take }),
      this.prisma.articleLocale.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toSummary), total, page, pageSize);
  }

  async getArticleBySlug(locale: Locale, slug: string): Promise<PublicArticleDetailDto> {
    const row = await this.prisma.articleLocale.findUnique({ where: { locale_slug: { locale, slug } }, include: { article: { include: articleInclude(locale) } } });
    if (!row || row.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    const body = await resolveRichTextMedia(this.prisma, row.body as unknown as RichTextDocument);
    return { ...toSummary(row), body, seoTitle: row.seoTitle, seoDescription: row.seoDescription };
  }

  async getArticleReference(locale: Locale, articleId: string): Promise<PublicArticleReferenceDto | null> {
    const row = await this.prisma.articleLocale.findUnique({ where: { articleId_locale: { articleId, locale } }, include: { article: { include: articleInclude(locale) } } });
    if (!row || row.status !== ArticleLifecycleStatus.VISIBLE) return null;
    return toReference(row);
  }

  async listCategories(locale: Locale): Promise<PublicCategoryDto[]> {
    const rows = await this.prisma.categoryLocale.findMany({ where: { locale }, orderBy: { name: "asc" } });
    return rows.map(toPublicCategoryDto);
  }

  async getCategoryBySlug(locale: Locale, slug: string): Promise<PublicCategoryDto> {
    const row = await this.prisma.categoryLocale.findUnique({ where: { locale_slug: { locale, slug } } });
    if (!row) throw new CategoryNotFoundException({ locale, slug });
    return toPublicCategoryDto(row);
  }

  async listTags(locale: Locale): Promise<PublicTagDto[]> {
    const rows = await this.prisma.tagLocale.findMany({ where: { locale }, orderBy: { name: "asc" } });
    return rows.map(toPublicTagDto);
  }

  async getTagBySlug(locale: Locale, slug: string): Promise<PublicTagDto> {
    const row = await this.prisma.tagLocale.findUnique({ where: { locale_slug: { locale, slug } } });
    if (!row) throw new TagNotFoundException({ locale, slug });
    return toPublicTagDto(row);
  }
}
