import { estimateReadingMinutes } from "./reading-time.util";
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

/** Guides are articles in this category; they have their own section (/guides), distinct from the blog. */
export const GUIDE_CATEGORY_SLUG = "guides";

function canonicalPath(locale: Locale, slug: string, categorySlug?: string | null): string {
  return categorySlug === GUIDE_CATEGORY_SLUG ? `/${locale}/guides/${slug}` : `/${locale}/blog/${slug}`;
}

function toSummary(row: PublicArticleLocaleRow): PublicArticleSummaryDto {
  const { article } = row;
  return {
    id: article.id,
    locale: row.locale as unknown as PublicArticleSummaryDto["locale"],
    slug: row.slug,
    canonicalPath: canonicalPath(row.locale, row.slug, article.category?.locales[0]?.slug),
    title: row.title,
    excerpt: row.excerpt,
    coverMediaAsset: article.coverMediaAsset ? toMediaAssetDto(article.coverMediaAsset) : null,
    author: article.author ? toContentAuthorDto(article.author) : null,
    category: article.category?.locales[0] ? toPublicCategoryDto(article.category.locales[0]) : null,
    tags: article.tags.map((t) => t.tag.locales[0]).filter((l): l is NonNullable<typeof l> => Boolean(l)).map(toPublicTagDto),
    publishedAt: row.publishedAt!.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    estimatedReadingMinutes: estimateReadingMinutes(row.body, [row.title, row.excerpt ?? ""]),
  };
}

function toReference(row: PublicArticleLocaleRow): PublicArticleReferenceDto {
  const summary = toSummary(row);
  return { id: summary.id, locale: summary.locale, slug: summary.slug, canonicalPath: summary.canonicalPath, title: summary.title, excerpt: summary.excerpt, coverMediaAsset: summary.coverMediaAsset };
}

export interface ListPublicArticlesQuery extends PaginationQueryDto {
  categorySlug?: string;
  tagSlug?: string;
  excludeCategorySlug?: string;
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
        ...(query.excludeCategorySlug
          ? { OR: [{ categoryId: null }, { category: { locales: { none: { locale, slug: query.excludeCategorySlug } } } }] }
          : {}),
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

  /**
   * Related reading by shared category (3 points) and shared tags (1 point each) only — same locale, visible,
   * never the article itself. Ties break by newest, then id, so the order is stable.
   */
  async relatedArticles(locale: Locale, slug: string, limit = 4): Promise<PublicArticleSummaryDto[]> {
    const current = await this.prisma.articleLocale.findUnique({ where: { locale_slug: { locale, slug } }, include: { article: { select: { id: true, categoryId: true, tags: { select: { tagId: true } } } } } });
    if (!current || current.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    const tagIds = current.article.tags.map((t) => t.tagId);
    const signals: Prisma.ArticleWhereInput[] = [...(current.article.categoryId ? [{ categoryId: current.article.categoryId }] : []), ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : [])];
    if (!signals.length) return [];
    const rows = await this.prisma.articleLocale.findMany({
      where: { locale, status: ArticleLifecycleStatus.VISIBLE, articleId: { not: current.articleId }, article: { OR: signals } },
      include: { article: { include: articleInclude(locale) } },
      take: 50,
    });
    const score = (r: (typeof rows)[number]) => (current.article.categoryId && r.article.categoryId === current.article.categoryId ? 3 : 0) + r.article.tags.filter((t) => tagIds.includes(t.tagId)).length;
    return rows
      .map((r) => ({ r, s: score(r) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.r.publishedAt?.getTime() ?? 0) - (a.r.publishedAt?.getTime() ?? 0) || a.r.id.localeCompare(b.r.id))
      .slice(0, Math.min(Math.max(limit, 1), 5))
      .map((x) => toSummary(x.r));
  }

  /** Aggregate helpful / not-helpful counts (no identities) plus the caller's own answer when signed in. */
  async feedbackSummary(locale: Locale, slug: string, userId?: string) {
    const articleId = await this.visibleArticleId(locale, slug);
    const [helpful, notHelpful, mine] = await Promise.all([
      this.prisma.articleFeedback.count({ where: { articleId, helpful: true } }),
      this.prisma.articleFeedback.count({ where: { articleId, helpful: false } }),
      userId ? this.prisma.articleFeedback.findUnique({ where: { articleId_userId: { articleId, userId } }, select: { helpful: true } }) : null,
    ]);
    return { helpfulCount: helpful, notHelpfulCount: notHelpful, mine: mine ? (mine.helpful ? "HELPFUL" : "NOT_HELPFUL") : null };
  }

  /** One answer per member per article; changing it updates the same row. A reason is only kept for NOT_HELPFUL. */
  async giveFeedback(locale: Locale, slug: string, userId: string, vote: "HELPFUL" | "NOT_HELPFUL", reason?: string) {
    const articleId = await this.visibleArticleId(locale, slug);
    const helpful = vote === "HELPFUL";
    const data = { helpful, reason: helpful ? null : reason?.trim() || null };
    await this.prisma.articleFeedback.upsert({ where: { articleId_userId: { articleId, userId } }, create: { articleId, userId, ...data }, update: data });
    return this.feedbackSummary(locale, slug, userId);
  }

  private async visibleArticleId(locale: Locale, slug: string) {
    const row = await this.prisma.articleLocale.findUnique({ where: { locale_slug: { locale, slug } }, select: { articleId: true, status: true } });
    if (!row || row.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    return row.articleId;
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
