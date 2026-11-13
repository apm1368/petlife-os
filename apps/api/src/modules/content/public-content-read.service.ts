import { estimateReadingMinutes } from "./reading-time.util";
import { articleCanonicalPath } from "./article-paths";
import { Injectable } from "@nestjs/common";
import { ArticleLifecycleStatus, Locale, Prisma } from "@prisma/client";
import type { PaginatedDto, PublicArticleDetailDto, PublicArticleFeedItemDto, PublicArticleReferenceDto, PublicArticleSlugRedirectDto, PublicArticleSummaryDto, PublicCategoryDto, PublicTagDto, RichTextDocument } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { excludeDemoRecordsFromPublicReads } from "../../common/public-record-origin";
import { ArticleLocaleNotFoundException, CategoryNotFoundException, TagNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";
import { PUBLIC_CONTENT_AUTHOR_INCLUDE, PUBLIC_MEDIA_ASSET_SELECT, resolveRichTextMedia, toPublicCategoryDto, toPublicContentAuthorDto, toPublicMediaAssetDto, toPublicTagDto } from "./content-mapper";

function articleInclude(locale: Locale) {
  return {
    author: { include: PUBLIC_CONTENT_AUTHOR_INCLUDE },
    category: { include: { locales: { where: { locale } } } },
    coverMediaAsset: { select: PUBLIC_MEDIA_ASSET_SELECT },
    tags: { include: { tag: { include: { locales: { where: { locale } } } } } },
  } as const;
}

type PublicArticleLocaleRow = Prisma.ArticleLocaleGetPayload<{ include: { article: { include: ReturnType<typeof articleInclude> } } }>;

export { GUIDE_CATEGORY_SLUG } from "./article-paths";
const canonicalPath = articleCanonicalPath;

function toSummary(row: PublicArticleLocaleRow): PublicArticleSummaryDto {
  const { article } = row;
  return {
    id: article.id,
    locale: row.locale as unknown as PublicArticleSummaryDto["locale"],
    slug: row.slug,
    canonicalPath: canonicalPath(row.locale, row.slug, article.category?.locales[0]?.slug),
    title: row.title,
    excerpt: row.excerpt,
    coverMediaAsset: article.coverMediaAsset ? toPublicMediaAssetDto(article.coverMediaAsset) : null,
    author: article.author ? toPublicContentAuthorDto(article.author) : null,
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
        ...excludeDemoRecordsFromPublicReads(),
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
    const row = await this.prisma.articleLocale.findFirst({ where: { locale, slug, article: excludeDemoRecordsFromPublicReads() }, include: { article: { include: articleInclude(locale) } } });
    if (!row || row.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    const [body, siblings] = await Promise.all([
      resolveRichTextMedia(this.prisma, row.body as unknown as RichTextDocument),
      this.prisma.articleLocale.findMany({
        where: { articleId: row.articleId, status: ArticleLifecycleStatus.VISIBLE, locale: { not: locale } },
        select: { locale: true, slug: true, article: { select: { category: { select: { locales: { select: { locale: true, slug: true } } } } } } },
      }),
    ]);
    const translations = siblings.map((sibling) => ({
      locale: sibling.locale as unknown as PublicArticleSummaryDto["locale"],
      canonicalPath: canonicalPath(sibling.locale, sibling.slug, sibling.article.category?.locales.find((l) => l.locale === sibling.locale)?.slug),
    }));
    return { ...toSummary(row), body, seoTitle: row.seoTitle, seoDescription: row.seoDescription, translations };
  }

  /** An old address of a renamed article, answered with where the article lives now (only while it is visible in that locale). */
  async slugRedirect(locale: Locale, slug: string): Promise<PublicArticleSlugRedirectDto> {
    const redirect = await this.prisma.articleSlugRedirect.findUnique({ where: { locale_slug: { locale, slug } }, select: { articleId: true } });
    if (!redirect) throw new ArticleLocaleNotFoundException({ locale, slug });
    const target = await this.prisma.articleLocale.findFirst({
      where: { articleId: redirect.articleId, locale, status: ArticleLifecycleStatus.VISIBLE, article: excludeDemoRecordsFromPublicReads() },
      include: { article: { include: articleInclude(locale) } },
    });
    if (!target) throw new ArticleLocaleNotFoundException({ locale, slug });
    return { canonicalPath: toSummary(target).canonicalPath };
  }

  /**
   * Every visible article locale (optionally one locale), newest first, for the sitemap, RSS and llms.txt.
   * Capped so a runaway catalogue can never turn one request into an unbounded read.
   */
  async feed(locale: Locale | undefined, withBody: boolean): Promise<PublicArticleFeedItemDto[]> {
    const rows = await this.prisma.articleLocale.findMany({
      where: { status: ArticleLifecycleStatus.VISIBLE, ...(locale ? { locale } : {}), article: excludeDemoRecordsFromPublicReads() },
      include: {
        article: {
          include: {
            category: { include: { locales: true } },
            coverMediaAsset: { select: PUBLIC_MEDIA_ASSET_SELECT },
            tags: { include: { tag: { include: { locales: true } } } },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 2000,
    });
    return Promise.all(rows.map(async (row) => {
      const category = row.article.category?.locales.find((l) => l.locale === row.locale) ?? null;
      const body = await resolveRichTextMedia(this.prisma, row.body as unknown as RichTextDocument);
      const videos = body.flatMap((block) => (block.type === "video" && block.url ? [{ url: block.url, posterUrl: block.posterUrl ?? null, title: block.title, description: block.description ?? null, durationSeconds: block.durationSeconds ?? null }] : []));
      const cover = row.article.coverMediaAsset;
      return {
        articleId: row.articleId,
        locale: row.locale as unknown as PublicArticleFeedItemDto["locale"],
        slug: row.slug,
        canonicalPath: canonicalPath(row.locale, row.slug, category?.slug),
        title: row.title,
        excerpt: row.excerpt,
        seoDescription: row.seoDescription,
        categorySlug: category?.slug ?? null,
        categoryName: category?.name ?? null,
        tags: row.article.tags.map((t) => t.tag.locales.find((l) => l.locale === row.locale)?.name).filter((name): name is string => Boolean(name)),
        coverUrl: cover?.url ?? null,
        coverAlt: cover?.altText ?? null,
        videos,
        publishedAt: row.publishedAt!.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        ...(withBody ? { body } : {}),
      };
    }));
  }

  /**
   * Related reading by shared category (3 points) and shared tags (1 point each) only — same locale, visible,
   * never the article itself. Ties break by newest, then id, so the order is stable.
   */
  async relatedArticles(locale: Locale, slug: string, limit = 4): Promise<PublicArticleSummaryDto[]> {
    const current = await this.prisma.articleLocale.findFirst({ where: { locale, slug, article: excludeDemoRecordsFromPublicReads() }, include: { article: { select: { id: true, categoryId: true, tags: { select: { tagId: true } } } } } });
    if (!current || current.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    const tagIds = current.article.tags.map((t) => t.tagId);
    const signals: Prisma.ArticleWhereInput[] = [...(current.article.categoryId ? [{ categoryId: current.article.categoryId }] : []), ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : [])];
    if (!signals.length) return [];
    const rows = await this.prisma.articleLocale.findMany({
      where: { locale, status: ArticleLifecycleStatus.VISIBLE, articleId: { not: current.articleId }, article: { ...excludeDemoRecordsFromPublicReads(), OR: signals } },
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
    const row = await this.prisma.articleLocale.findFirst({ where: { locale, slug, article: excludeDemoRecordsFromPublicReads() }, select: { articleId: true, status: true } });
    if (!row || row.status !== ArticleLifecycleStatus.VISIBLE) throw new ArticleLocaleNotFoundException({ locale, slug });
    return row.articleId;
  }

  async getArticleReference(locale: Locale, articleId: string): Promise<PublicArticleReferenceDto | null> {
    const row = await this.prisma.articleLocale.findFirst({ where: { articleId, locale, article: excludeDemoRecordsFromPublicReads() }, include: { article: { include: articleInclude(locale) } } });
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
