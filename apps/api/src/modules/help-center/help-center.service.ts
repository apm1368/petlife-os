import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { HelpArticleStatus, Locale, Prisma } from "@prisma/client";
import type { AppEnv } from "../../config/env";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { excerpt, fromSnapshot, scoreArticle, searchTerms, SLUG_PATTERN, toSnapshot, type HelpArticleContent } from "./help-center.util";

/** What a search or list returns for one article: enough to render a result row, never the whole body. */
export interface HelpArticleSummaryDto {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  excerpt: string;
  categorySlug: string;
  isFaq: boolean;
  publishedAt: string | null;
}

export interface HelpArticleDto extends Omit<HelpArticleSummaryDto, "excerpt"> {
  body: string;
  contextKeys: string[];
  category: { slug: string; title: string };
  version: number;
  updatedAt: string;
}

export interface SaveHelpArticleInput {
  categoryId: string;
  locale: Locale;
  slug: string;
  title: string;
  summary?: string | null;
  body: string;
  contextKeys?: string[];
  isFaq?: boolean;
  sortOrder?: number;
  changeNote?: string | null;
}

/**
 * The Help Center's reads and writes.
 *
 * Public reads go through a single predicate, `PUBLIC`, so "what a reader may see" cannot drift between
 * the list, the search, the article and the contextual lookups: status PUBLISHED *and* a publishedVersion
 * pointer. An article that was saved but never published, or that was unpublished, is invisible — empty
 * means empty, and a fresh database serves no articles at all.
 *
 * Admin writes never touch what readers see directly. A save appends an immutable HelpArticleVersion and
 * updates the working copy; publishing records which version number the public reads, and a rollback
 * copies an old snapshot forward as a NEW version (history is append-only — no version is rewritten).
 */
@Injectable()
export class HelpCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private static readonly PUBLIC: Prisma.HelpArticleWhereInput = { status: HelpArticleStatus.PUBLISHED, publishedVersion: { not: null } };

  // ------------------------------------------------------------------ public reads

  async listCategories(locale: Locale) {
    const rows = await this.prisma.helpCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: { _count: { select: { articles: { where: { ...HelpCenterService.PUBLIC, locale } } } } },
    });
    return rows
      // A category with nothing published in this locale is not shown: no empty shelves.
      .filter((c) => c._count.articles > 0)
      .map((c) => ({
        slug: c.slug,
        title: locale === Locale.en ? (c.titleEn ?? c.titleFa) : c.titleFa,
        description: locale === Locale.en ? (c.descriptionEn ?? c.descriptionFa) : c.descriptionFa,
        articleCount: c._count.articles,
      }));
  }

  async listArticles(locale: Locale, opts: { categorySlug?: string; faqOnly?: boolean; contextKey?: string; limit?: number }): Promise<HelpArticleSummaryDto[]> {
    const rows = await this.prisma.helpArticle.findMany({
      where: {
        ...HelpCenterService.PUBLIC,
        locale,
        ...(opts.categorySlug ? { category: { slug: opts.categorySlug, isActive: true } } : { category: { isActive: true } }),
        ...(opts.faqOnly ? { isFaq: true } : {}),
        ...(opts.contextKey ? { contextKeys: { has: opts.contextKey } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take: Math.min(opts.limit ?? 50, 100),
      include: { category: { select: { slug: true } } },
    });
    return rows.map((a) => this.toSummary(a));
  }

  async getArticle(locale: Locale, slug: string): Promise<HelpArticleDto> {
    const a = await this.prisma.helpArticle.findFirst({
      where: { ...HelpCenterService.PUBLIC, locale, slug, category: { isActive: true } },
      include: { category: { select: { slug: true, titleFa: true, titleEn: true } } },
    });
    if (!a) throw new NotFoundApiException("HelpArticle");
    return {
      ...this.toSummary(a),
      body: a.body,
      contextKeys: a.contextKeys,
      category: { slug: a.category.slug, title: locale === Locale.en ? (a.category.titleEn ?? a.category.titleFa) : a.category.titleFa },
      version: a.publishedVersion ?? 0,
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  /**
   * Search over published articles only. Scoring happens in application code over a bounded candidate set
   * (the locale's published articles, capped) rather than in SQL: Persian needs letter/digit normalization
   * that `ILIKE` does not do, and the Help Center is a few hundred articles, not millions of rows.
   */
  async search(locale: Locale, query: string, limit = 20): Promise<HelpArticleSummaryDto[]> {
    const terms = searchTerms(query);
    if (terms.length === 0) return [];
    const candidates = await this.prisma.helpArticle.findMany({
      where: { ...HelpCenterService.PUBLIC, locale, category: { isActive: true } },
      take: 500,
      include: { category: { select: { slug: true } } },
    });
    return candidates
      .map((a) => ({ a, score: scoreArticle(a, terms) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title))
      .slice(0, Math.min(limit, 50))
      .map((x) => this.toSummary(x.a));
  }

  /** Limit repeat votes per article/client/day. Shared IPs can collide; rotating clients can evade it. */
  async vote(locale: Locale, slug: string, helpful: boolean, client: { ip?: string; userAgent?: string }): Promise<{ ok: true }> {
    // Express req.ip respects the application's configured trusted proxies; never trust a forwarded header directly.
    if (!client.ip) throw new ServiceUnavailableException("Feedback is temporarily unavailable");
    const day = new Date().toISOString().slice(0, 10); // UTC day, also part of the keyed pseudonym
    const digest = createHmac("sha256", this.config.get("SESSION_SECRET", { infer: true }))
      .update(JSON.stringify(["help-vote-v1", day, client.ip, (client.userAgent ?? "").slice(0, 512)]))
      .digest("hex");
    await this.prisma.$transaction(async (tx) => {
      const article = await tx.helpArticle.findFirst({ where: { ...HelpCenterService.PUBLIC, locale, slug, category: { isActive: true } }, select: { id: true } });
      if (!article) throw new NotFoundApiException("HelpArticle");
      // Indexed, bounded retention: retain only today and yesterday; IP and user agent are never stored.
      await tx.$executeRaw`DELETE FROM "help_vote_dedup" WHERE "vote_day" < ${day}::date - INTERVAL '1 day'`;
      const inserted = await tx.$executeRaw`INSERT INTO "help_vote_dedup" ("article_id", "vote_day", "client_digest") VALUES (${article.id}::uuid, ${day}::date, ${digest}) ON CONFLICT DO NOTHING`;
      if (!inserted) return;
      const result = await tx.helpArticle.updateMany({
        where: { id: article.id, ...HelpCenterService.PUBLIC, category: { isActive: true } },
        data: helpful ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } },
      });
      // A concurrent unpublish must not leave a dedup record for a vote that was not counted.
      if (result.count === 0) throw new NotFoundApiException("HelpArticle");
    });
    return { ok: true };
  }

  private toSummary(a: { id: string; slug: string; title: string; summary: string | null; body: string; isFaq: boolean; publishedAt: Date | null; category: { slug: string } }): HelpArticleSummaryDto {
    return { id: a.id, slug: a.slug, title: a.title, summary: a.summary, excerpt: excerpt(a.body), categorySlug: a.category.slug, isFaq: a.isFaq, publishedAt: a.publishedAt?.toISOString() ?? null };
  }

  // ------------------------------------------------------------------ admin: categories

  async adminListCategories() {
    return this.prisma.helpCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }], include: { _count: { select: { articles: true } } } });
  }

  async adminCreateCategory(admin: ResolvedAdminContext, input: { slug: string; titleFa: string; titleEn?: string | null; descriptionFa?: string | null; descriptionEn?: string | null; sortOrder?: number }) {
    this.assertSlug(input.slug);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.helpCategory.create({ data: { slug: input.slug, titleFa: input.titleFa, titleEn: input.titleEn ?? null, descriptionFa: input.descriptionFa ?? null, descriptionEn: input.descriptionEn ?? null, sortOrder: input.sortOrder ?? 0 } });
        await this.audit.record({ adminUserId: admin.adminUserId, action: "help_category.created", entityType: "HelpCategory", entityId: row.id, afterSummary: { slug: row.slug }, tx });
        return row;
      });
      return created;
    } catch (e) {
      throw this.uniqueToValidation(e, "slug", "SLUG_TAKEN");
    }
  }

  async adminUpdateCategory(admin: ResolvedAdminContext, id: string, input: { titleFa?: string; titleEn?: string | null; descriptionFa?: string | null; descriptionEn?: string | null; sortOrder?: number; isActive?: boolean }) {
    const existing = await this.prisma.helpCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundApiException("HelpCategory");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.helpCategory.update({ where: { id }, data: input });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "help_category.updated", entityType: "HelpCategory", entityId: id, beforeSummary: { isActive: existing.isActive }, afterSummary: { isActive: row.isActive }, tx });
      return row;
    });
  }

  // ------------------------------------------------------------------ admin: articles

  async adminListArticles(opts: { locale?: Locale; status?: HelpArticleStatus; categoryId?: string; q?: string }) {
    return this.prisma.helpArticle.findMany({
      where: { ...(opts.locale ? { locale: opts.locale } : {}), ...(opts.status ? { status: opts.status } : {}), ...(opts.categoryId ? { categoryId: opts.categoryId } : {}), ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { category: { select: { slug: true, titleFa: true } } },
    });
  }

  async adminGetArticle(id: string) {
    const a = await this.prisma.helpArticle.findUnique({ where: { id }, include: { category: { select: { slug: true, titleFa: true } } } });
    if (!a) throw new NotFoundApiException("HelpArticle");
    return a;
  }

  /** Creates (when `id` is absent) or updates the working copy and appends a version. Never changes what readers see. */
  async adminSaveArticle(admin: ResolvedAdminContext, id: string | null, input: SaveHelpArticleInput) {
    this.assertSlug(input.slug);
    const category = await this.prisma.helpCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
    if (!category) throw new ValidationApiException({ field: "categoryId", reason: "CATEGORY_NOT_FOUND" });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const content: HelpArticleContent = { categoryId: input.categoryId, slug: input.slug, title: input.title, summary: input.summary ?? null, body: input.body, contextKeys: input.contextKeys ?? [], isFaq: input.isFaq ?? false, sortOrder: input.sortOrder ?? 0 };
        let articleId: string;
        if (id === null) {
          const created = await tx.helpArticle.create({ data: { ...content, locale: input.locale, createdByAdminId: admin.adminUserId, updatedByAdminId: admin.adminUserId } });
          articleId = created.id;
        } else {
          const existing = await tx.helpArticle.findUnique({ where: { id }, select: { id: true, locale: true, status: true, slug: true } });
          if (!existing) throw new NotFoundApiException("HelpArticle");
          // A locale is part of an article's identity (the (locale, slug) key); changing it would be a different article.
          if (existing.locale !== input.locale) throw new ValidationApiException({ field: "locale", reason: "LOCALE_IMMUTABLE" });
          // Readers see this very row, so while the article is published a save must NOT overwrite it: the edit
          // lives only in the new version until someone publishes it. Overwriting here would leak a draft to the
          // public the moment it is saved — the exact thing "editing and publishing are separate actions" prevents.
          // (A published article's slug is likewise frozen: a URL a reader or search engine holds never moves.)
          if (existing.status === HelpArticleStatus.PUBLISHED) {
            if (existing.slug !== input.slug) throw new ValidationApiException({ field: "slug", reason: "SLUG_FROZEN_WHILE_PUBLISHED" });
            await tx.helpArticle.update({ where: { id }, data: { updatedByAdminId: admin.adminUserId } });
          } else {
            await tx.helpArticle.update({ where: { id }, data: { ...content, updatedByAdminId: admin.adminUserId } });
          }
          articleId = id;
        }
        const versionNumber = await this.appendVersion(tx, articleId, admin.adminUserId, content, input.changeNote ?? null);
        await this.audit.record({ adminUserId: admin.adminUserId, action: "help_article.saved", entityType: "HelpArticle", entityId: articleId, afterSummary: { version: versionNumber, slug: input.slug }, tx });
        return { ...(await tx.helpArticle.findUniqueOrThrow({ where: { id: articleId } })), version: versionNumber };
      });
    } catch (e) {
      throw this.uniqueToValidation(e, "slug", "SLUG_TAKEN");
    }
  }

  /** Makes the given version (default: the newest) the one readers see. Idempotent: republishing the same version is a no-op write. */
  async adminPublish(admin: ResolvedAdminContext, id: string, versionNumber?: number) {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.helpArticle.findUnique({ where: { id } });
      if (!article) throw new NotFoundApiException("HelpArticle");
      const target = versionNumber ?? (await tx.helpArticleVersion.aggregate({ where: { articleId: id }, _max: { versionNumber: true } }))._max.versionNumber;
      if (!target) throw new ValidationApiException({ field: "version", reason: "NO_VERSION_TO_PUBLISH" });
      const version = await tx.helpArticleVersion.findUnique({ where: { articleId_versionNumber: { articleId: id, versionNumber: target } } });
      if (!version) throw new NotFoundApiException("HelpArticleVersion");
      const content = fromSnapshot(version.snapshot);
      if (!content) throw new ValidationApiException({ field: "version", reason: "SNAPSHOT_CORRUPT", version: target });
      const updated = await tx.helpArticle.update({
        where: { id },
        // Publishing copies the chosen snapshot into the working copy so the public row and the version it
        // points at can never disagree.
        data: { ...content, status: HelpArticleStatus.PUBLISHED, publishedVersion: target, publishedAt: article.publishedAt ?? new Date(), updatedByAdminId: admin.adminUserId },
      });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "help_article.published", entityType: "HelpArticle", entityId: id, beforeSummary: { status: article.status, version: article.publishedVersion }, afterSummary: { status: updated.status, version: target }, tx });
      return updated;
    });
  }

  async adminUnpublish(admin: ResolvedAdminContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.helpArticle.findUnique({ where: { id } });
      if (!article) throw new NotFoundApiException("HelpArticle");
      const updated = await tx.helpArticle.update({ where: { id }, data: { status: HelpArticleStatus.ARCHIVED, publishedVersion: null, updatedByAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "help_article.unpublished", entityType: "HelpArticle", entityId: id, beforeSummary: { status: article.status }, afterSummary: { status: updated.status }, tx });
      return updated;
    });
  }

  async adminListVersions(id: string) {
    await this.adminGetArticle(id);
    return this.prisma.helpArticleVersion.findMany({ where: { articleId: id }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, editorAdminId: true, changeNote: true, createdAt: true } });
  }

  /**
   * Rolls the working copy back to an earlier snapshot by writing it forward as a NEW version — never by
   * rewriting or deleting history. If the article is currently published, the rolled-back version is
   * published too, so a rollback takes effect for readers in one step; a draft stays a draft.
   */
  async adminRollback(admin: ResolvedAdminContext, id: string, toVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const article = await tx.helpArticle.findUnique({ where: { id } });
      if (!article) throw new NotFoundApiException("HelpArticle");
      const version = await tx.helpArticleVersion.findUnique({ where: { articleId_versionNumber: { articleId: id, versionNumber: toVersion } } });
      if (!version) throw new NotFoundApiException("HelpArticleVersion");
      const content = fromSnapshot(version.snapshot);
      if (!content) throw new ValidationApiException({ field: "version", reason: "SNAPSHOT_CORRUPT", version: toVersion });
      const newVersion = await this.appendVersion(tx, id, admin.adminUserId, content, `Rollback to version ${toVersion}`);
      const wasPublished = article.status === HelpArticleStatus.PUBLISHED;
      const updated = await tx.helpArticle.update({ where: { id }, data: { ...content, updatedByAdminId: admin.adminUserId, ...(wasPublished ? { publishedVersion: newVersion } : {}) } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "help_article.rolled_back", entityType: "HelpArticle", entityId: id, afterSummary: { restoredFrom: toVersion, newVersion, stillPublished: wasPublished }, tx });
      return { ...updated, version: newVersion };
    });
  }

  // ------------------------------------------------------------------ helpers

  private async appendVersion(tx: Prisma.TransactionClient, articleId: string, editorAdminId: string, content: HelpArticleContent, changeNote: string | null): Promise<number> {
    const max = await tx.helpArticleVersion.aggregate({ where: { articleId }, _max: { versionNumber: true } });
    const versionNumber = (max._max.versionNumber ?? 0) + 1;
    await tx.helpArticleVersion.create({ data: { articleId, versionNumber, editorAdminId, changeNote, snapshot: toSnapshot(content) as unknown as Prisma.InputJsonValue } });
    return versionNumber;
  }

  private assertSlug(slug: string): void {
    if (!SLUG_PATTERN.test(slug)) throw new ValidationApiException({ field: "slug", reason: "INVALID_SLUG" });
  }

  /** Turns a unique-constraint violation into the field-level validation error the client already renders. */
  private uniqueToValidation(error: unknown, field: string, reason: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new ValidationApiException({ field, reason });
    return error;
  }
}
