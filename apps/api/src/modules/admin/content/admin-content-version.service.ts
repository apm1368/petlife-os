import { Injectable } from "@nestjs/common";
import type { Locale } from "@prisma/client";
import type { ArticleLocaleSnapshot, ContentVersionDetailDto, ContentVersionSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ContentVersionNotFoundException } from "../../../common/errors/api-exception";
import { toAdminActorDto } from "../../content/content-mapper";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AdminArticleService } from "./admin-article.service";

const VERSION_INCLUDE = { editorAdmin: { include: { user: true } } } as const;

/**
 * Recoverable history for one ArticleLocale (spec: "every meaningful save/
 * publish should create a recoverable version... restore should create a
 * NEW version, never mutate history"). Versions themselves are created by
 * AdminArticleService.saveLocale()/create() at write time; this service is
 * the read side plus `restore()`, which calls back into
 * AdminArticleService.saveLocale() with the target version's own snapshot —
 * the exact same save path every other edit takes, so a restore is
 * indistinguishable from a manual edit in the history it leaves behind,
 * just with a system-supplied change note.
 */
@Injectable()
export class AdminContentVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly articles: AdminArticleService,
  ) {}

  async list(articleId: string, locale: Locale): Promise<ContentVersionSummaryDto[]> {
    const rows = await this.prisma.contentVersion.findMany({ where: { articleId, locale }, include: VERSION_INCLUDE, orderBy: { versionNumber: "desc" } });
    return rows.map((r) => ({
      id: r.id,
      articleId: r.articleId,
      locale: r.locale as unknown as ContentVersionSummaryDto["locale"],
      versionNumber: r.versionNumber,
      editorAdmin: toAdminActorDto(r.editorAdmin),
      changeNote: r.changeNote,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async get(versionId: string): Promise<ContentVersionDetailDto> {
    const row = await this.prisma.contentVersion.findUnique({ where: { id: versionId }, include: VERSION_INCLUDE });
    if (!row) throw new ContentVersionNotFoundException({ versionId });
    return {
      id: row.id,
      articleId: row.articleId,
      locale: row.locale as unknown as ContentVersionDetailDto["locale"],
      versionNumber: row.versionNumber,
      editorAdmin: toAdminActorDto(row.editorAdmin),
      changeNote: row.changeNote,
      createdAt: row.createdAt.toISOString(),
      snapshot: row.snapshot as unknown as ArticleLocaleSnapshot,
    };
  }

  async restore(admin: ResolvedAdminContext, versionId: string, requestId?: string) {
    const version = await this.get(versionId);
    const saved = await this.articles.saveLocale(
      admin,
      version.articleId,
      version.locale,
      { ...version.snapshot, excerpt: version.snapshot.excerpt ?? undefined, seoTitle: version.snapshot.seoTitle ?? undefined, seoDescription: version.snapshot.seoDescription ?? undefined, changeNote: `Restored from version ${version.versionNumber}` },
      requestId,
    );
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "article.restored", entityType: "ARTICLE", entityId: version.articleId, afterSummary: { locale: version.locale, restoredFromVersion: version.versionNumber }, requestId });
    return saved;
  }
}
