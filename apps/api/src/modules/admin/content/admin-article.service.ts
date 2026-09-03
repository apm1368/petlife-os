import { Injectable } from "@nestjs/common";
import { ArticleLifecycleStatus, Locale, Prisma } from "@prisma/client";
import type { AdminArticleDto, AdminArticleListItemDto, AdminArticleLocaleDto, PaginatedDto, RichTextDocument } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  ArticleLocaleNotFoundException,
  ArticleNotFoundException,
  DuplicateArticleSlugException,
  InvalidArticleLifecycleTransitionException,
} from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { CATEGORY_INCLUDE, CONTENT_AUTHOR_INCLUDE, MEDIA_ASSET_INCLUDE, TAG_INCLUDE, resolveRichTextMedia, toAdminActorDto, toCategoryDto, toContentAuthorDto, toMediaAssetDto, toPublicCategoryDto, toTagDto } from "../../content/content-mapper";
import { validateRichTextDocument } from "../../content/rich-text.util";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AdminMediaService } from "./admin-media.service";

/** Exactly the five transitions the spec enumerates — ARCHIVED is a deliberate terminal state this phase (see ArticleLifecycleStatus's own schema.prisma doc comment). */
const ALLOWED_TRANSITIONS: Record<ArticleLifecycleStatus, ArticleLifecycleStatus[]> = {
  DRAFT: [ArticleLifecycleStatus.VISIBLE, ArticleLifecycleStatus.ARCHIVED],
  VISIBLE: [ArticleLifecycleStatus.HIDDEN],
  HIDDEN: [ArticleLifecycleStatus.VISIBLE, ArticleLifecycleStatus.ARCHIVED],
  ARCHIVED: [],
};

const ARTICLE_INCLUDE = {
  author: { include: CONTENT_AUTHOR_INCLUDE },
  category: { include: CATEGORY_INCLUDE },
  coverMediaAsset: { include: MEDIA_ASSET_INCLUDE },
  createdByAdmin: { include: { user: true } },
  tags: { include: { tag: { include: TAG_INCLUDE } } },
  locales: true,
} as const;
type ArticleWithRelations = Prisma.ArticleGetPayload<{ include: typeof ARTICLE_INCLUDE }>;

const ARTICLE_LOCALE_INCLUDE = { lastEditedByAdmin: { include: { user: true } } } as const;
type ArticleLocaleWithRelations = Prisma.ArticleLocaleGetPayload<{ include: typeof ARTICLE_LOCALE_INCLUDE }>;

function toArticleDto(row: ArticleWithRelations): AdminArticleDto {
  return {
    id: row.id,
    author: row.author ? toContentAuthorDto(row.author) : null,
    category: row.category ? toCategoryDto(row.category) : null,
    coverMediaAsset: row.coverMediaAsset ? toMediaAssetDto(row.coverMediaAsset) : null,
    tags: row.tags.map((t) => toTagDto(t.tag)),
    createdByAdmin: toAdminActorDto(row.createdByAdmin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    locales: row.locales.map((l) => ({
      locale: l.locale as unknown as AdminArticleDto["locales"][number]["locale"],
      status: l.status as unknown as AdminArticleDto["locales"][number]["status"],
      title: l.title,
      slug: l.slug,
      updatedAt: l.updatedAt.toISOString(),
    })),
  };
}

function toListItemDto(row: ArticleWithRelations): AdminArticleListItemDto {
  return {
    id: row.id,
    author: row.author ? toContentAuthorDto(row.author) : null,
    category: row.category ? toPublicCategoryDto(row.category.locales.find((l) => l.locale === "fa") ?? row.category.locales[0]!) : null,
    createdByAdmin: toAdminActorDto(row.createdByAdmin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    locales: row.locales.map((l) => ({
      locale: l.locale as unknown as AdminArticleListItemDto["locales"][number]["locale"],
      status: l.status as unknown as AdminArticleListItemDto["locales"][number]["status"],
      title: l.title,
      slug: l.slug,
      updatedAt: l.updatedAt.toISOString(),
    })),
  };
}

function toLocaleDto(row: ArticleLocaleWithRelations): AdminArticleLocaleDto {
  return {
    articleId: row.articleId,
    locale: row.locale as unknown as AdminArticleLocaleDto["locale"],
    status: row.status as unknown as AdminArticleLocaleDto["status"],
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body as unknown as RichTextDocument,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    lastEditedByAdmin: row.lastEditedByAdmin ? toAdminActorDto(row.lastEditedByAdmin) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ListArticlesQuery extends PaginationQueryDto {
  search?: string;
  status?: ArticleLifecycleStatus;
  locale?: Locale;
  categoryId?: string;
  authorId?: string;
}

export interface SaveArticleLocaleInput {
  title: string;
  slug: string;
  excerpt?: string;
  body: unknown;
  seoTitle?: string;
  seoDescription?: string;
  changeNote?: string;
}

/**
 * Article CRUD + the per-locale lifecycle transitions (spec: "Article
 * lifecycle... DRAFT/VISIBLE/HIDDEN/ARCHIVED"). Lives in AdminModule (not
 * the public ContentModule) because every mutation needs AdminAuditLogService
 * — the exact layering AdminSellerSettlementService (Handoff 14) and
 * AdminRefundService (Handoff 11) already established for admin-mutating
 * domain services.
 */
@Injectable()
export class AdminArticleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly media: AdminMediaService,
  ) {}

  async list(query: ListArticlesQuery): Promise<PaginatedDto<AdminArticleListItemDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const localeFilter: Prisma.ArticleLocaleWhereInput = {
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: "insensitive" as const } } : {}),
    };
    const where: Prisma.ArticleWhereInput = {
      categoryId: query.categoryId || undefined,
      authorId: query.authorId || undefined,
      locales: Object.keys(localeFilter).length > 0 ? { some: localeFilter } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({ where, include: ARTICLE_INCLUDE, orderBy: { updatedAt: "desc" }, skip, take }),
      this.prisma.article.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toListItemDto), total, page, pageSize);
  }

  async get(articleId: string): Promise<AdminArticleDto> {
    const row = await this.prisma.article.findUnique({ where: { id: articleId }, include: ARTICLE_INCLUDE });
    if (!row) throw new ArticleNotFoundException({ articleId });
    return toArticleDto(row);
  }

  async getLocale(articleId: string, locale: Locale): Promise<AdminArticleLocaleDto> {
    const row = await this.prisma.articleLocale.findUnique({ where: { articleId_locale: { articleId, locale } }, include: ARTICLE_LOCALE_INCLUDE });
    if (!row) throw new ArticleLocaleNotFoundException({ articleId, locale });
    return this.withResolvedMedia(toLocaleDto(row));
  }

  /** Creates the language-neutral Article shell and its first locale in one step — the common "start drafting" action needs exactly one call (spec: "create content quickly"). */
  async create(
    admin: ResolvedAdminContext,
    input: { locale: Locale; authorId?: string; categoryId?: string; coverMediaAssetId?: string; tagIds?: string[] } & SaveArticleLocaleInput,
    requestId?: string,
  ): Promise<AdminArticleDto> {
    const body = validateRichTextDocument(input.body);
    await this.assertSlugAvailable(input.locale, input.slug);
    if (input.coverMediaAssetId) await this.media.assertSelectable(input.coverMediaAssetId);

    const row = await this.prisma.$transaction(async (tx) => {
      const article = await tx.article.create({
        data: {
          authorId: input.authorId,
          categoryId: input.categoryId,
          coverMediaAssetId: input.coverMediaAssetId,
          createdByAdminId: admin.adminUserId,
          tags: input.tagIds ? { create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
          locales: {
            create: {
              locale: input.locale,
              title: input.title,
              slug: input.slug,
              excerpt: input.excerpt,
              body: body as unknown as Prisma.InputJsonValue,
              seoTitle: input.seoTitle,
              seoDescription: input.seoDescription,
              lastEditedByAdminId: admin.adminUserId,
            },
          },
        },
        include: ARTICLE_INCLUDE,
      });
      const locale = article.locales[0]!;
      await tx.contentVersion.create({
        data: { articleId: article.id, locale: input.locale, versionNumber: 1, editorAdminId: admin.adminUserId, changeNote: input.changeNote, snapshot: this.toSnapshot(locale) as unknown as Prisma.InputJsonValue },
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "article.created", entityType: "ARTICLE", entityId: article.id, afterSummary: { locale: input.locale, title: input.title, slug: input.slug }, requestId, tx });
      return article;
    });
    return toArticleDto(row);
  }

  /** Updates only the shared, locale-neutral fields — author/category/cover/tags. Never touches editorial content (see saveLocale) or lifecycle status (see publish/hide/archive). */
  async update(admin: ResolvedAdminContext, articleId: string, input: { authorId?: string | null; categoryId?: string | null; coverMediaAssetId?: string | null; tagIds?: string[] }, requestId?: string): Promise<AdminArticleDto> {
    const existing = await this.prisma.article.findUnique({ where: { id: articleId } });
    if (!existing) throw new ArticleNotFoundException({ articleId });
    if (input.coverMediaAssetId) await this.media.assertSelectable(input.coverMediaAssetId);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: articleId },
        data: {
          authorId: input.authorId === undefined ? undefined : input.authorId,
          categoryId: input.categoryId === undefined ? undefined : input.categoryId,
          coverMediaAssetId: input.coverMediaAssetId === undefined ? undefined : input.coverMediaAssetId,
          tags: input.tagIds ? { deleteMany: {}, create: input.tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
        include: ARTICLE_INCLUDE,
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "article.updated", entityType: "ARTICLE", entityId: articleId, requestId, tx });
      return updated;
    });
    return toArticleDto(row);
  }

  /**
   * Upserts one locale's editorial content and snapshots it as a new
   * ContentVersion in the same transaction (spec: "every meaningful save...
   * should create a recoverable version"). Never changes `status` — editing
   * and publishing are deliberately separate actions (spec). Row-locks the
   * existing ArticleLocale (when one exists) before computing the next
   * version number, so two concurrent saves to the same article/locale can
   * never produce two versions with the same number.
   */
  async saveLocale(admin: ResolvedAdminContext, articleId: string, locale: Locale, input: SaveArticleLocaleInput, requestId?: string): Promise<AdminArticleLocaleDto> {
    const body = validateRichTextDocument(input.body);
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new ArticleNotFoundException({ articleId });

    const row = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "content_article_locales" WHERE "articleId" = ${articleId}::uuid AND "locale" = ${locale}::"Locale" FOR UPDATE`;
      await this.assertSlugAvailable(locale, input.slug, locked?.id);

      let saved: ArticleLocaleWithRelations;
      let versionNumber: number;
      if (locked) {
        const lastVersion = await tx.contentVersion.findFirst({ where: { articleId, locale }, orderBy: { versionNumber: "desc" } });
        versionNumber = (lastVersion?.versionNumber ?? 0) + 1;
        saved = await tx.articleLocale.update({
          where: { id: locked.id },
          data: {
            title: input.title,
            slug: input.slug,
            excerpt: input.excerpt,
            body: body as unknown as Prisma.InputJsonValue,
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription,
            lastEditedByAdminId: admin.adminUserId,
          },
          include: ARTICLE_LOCALE_INCLUDE,
        });
      } else {
        versionNumber = 1;
        saved = await tx.articleLocale.create({
          data: {
            articleId,
            locale,
            title: input.title,
            slug: input.slug,
            excerpt: input.excerpt,
            body: body as unknown as Prisma.InputJsonValue,
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription,
            lastEditedByAdminId: admin.adminUserId,
          },
          include: ARTICLE_LOCALE_INCLUDE,
        });
      }

      await tx.contentVersion.create({
        data: { articleId, locale, versionNumber, editorAdminId: admin.adminUserId, changeNote: input.changeNote, snapshot: this.toSnapshot(saved) as unknown as Prisma.InputJsonValue },
      });
      await tx.article.update({ where: { id: articleId }, data: { updatedAt: new Date() } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "article.updated", entityType: "ARTICLE", entityId: articleId, reason: input.changeNote, afterSummary: { locale, versionNumber }, requestId, tx });
      return saved;
    });
    return this.withResolvedMedia(toLocaleDto(row));
  }

  async publish(admin: ResolvedAdminContext, articleId: string, locale: Locale, requestId?: string): Promise<AdminArticleLocaleDto> {
    return this.transition(admin, articleId, locale, ArticleLifecycleStatus.VISIBLE, "article.published", requestId);
  }

  async hide(admin: ResolvedAdminContext, articleId: string, locale: Locale, requestId?: string): Promise<AdminArticleLocaleDto> {
    return this.transition(admin, articleId, locale, ArticleLifecycleStatus.HIDDEN, "article.hidden", requestId);
  }

  async archive(admin: ResolvedAdminContext, articleId: string, locale: Locale, requestId?: string): Promise<AdminArticleLocaleDto> {
    return this.transition(admin, articleId, locale, ArticleLifecycleStatus.ARCHIVED, "article.archived", requestId);
  }

  private async transition(admin: ResolvedAdminContext, articleId: string, locale: Locale, to: ArticleLifecycleStatus, action: "article.published" | "article.hidden" | "article.archived", requestId?: string): Promise<AdminArticleLocaleDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.articleLocale.findUnique({ where: { articleId_locale: { articleId, locale } } });
      if (!existing) throw new ArticleLocaleNotFoundException({ articleId, locale });
      if (!ALLOWED_TRANSITIONS[existing.status].includes(to)) {
        throw new InvalidArticleLifecycleTransitionException({ articleId, locale, from: existing.status, to });
      }

      const updated = await tx.articleLocale.update({
        where: { id: existing.id },
        data: { status: to, publishedAt: to === ArticleLifecycleStatus.VISIBLE && !existing.publishedAt ? new Date() : undefined },
        include: ARTICLE_LOCALE_INCLUDE,
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action, entityType: "ARTICLE", entityId: articleId, beforeSummary: { status: existing.status }, afterSummary: { status: to, locale }, requestId, tx });
      return updated;
    });
    return this.withResolvedMedia(toLocaleDto(row));
  }

  private toSnapshot(locale: { title: string; slug: string; excerpt: string | null; body: Prisma.JsonValue; seoTitle: string | null; seoDescription: string | null }) {
    return { title: locale.title, slug: locale.slug, excerpt: locale.excerpt, body: locale.body, seoTitle: locale.seoTitle, seoDescription: locale.seoDescription };
  }

  private async withResolvedMedia(dto: AdminArticleLocaleDto): Promise<AdminArticleLocaleDto> {
    return { ...dto, body: await resolveRichTextMedia(this.prisma, dto.body) };
  }

  private async assertSlugAvailable(locale: Locale, slug: string, excludeArticleLocaleId?: string): Promise<void> {
    const existing = await this.prisma.articleLocale.findUnique({ where: { locale_slug: { locale, slug } } });
    if (existing && existing.id !== excludeArticleLocaleId) throw new DuplicateArticleSlugException({ locale, slug });
  }
}
