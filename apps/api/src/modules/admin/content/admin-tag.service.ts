import { Injectable } from "@nestjs/common";
import type { Locale } from "@prisma/client";
import type { TagDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DuplicateTagSlugException, TagNotFoundException } from "../../../common/errors/api-exception";
import { TAG_INCLUDE, toTagDto } from "../../content/content-mapper";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

export interface TagLocaleInput {
  locale: Locale;
  name: string;
  slug: string;
}

@Injectable()
export class AdminTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(): Promise<TagDto[]> {
    const rows = await this.prisma.tag.findMany({ include: TAG_INCLUDE, orderBy: { createdAt: "asc" } });
    return rows.map(toTagDto);
  }

  async create(admin: ResolvedAdminContext, locales: TagLocaleInput[], requestId?: string): Promise<TagDto> {
    await this.assertSlugsAvailable(locales);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tag.create({ data: { locales: { create: locales } }, include: TAG_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "tag.created", entityType: "TAG", entityId: created.id, afterSummary: { locales: locales.map((l) => l.slug) }, requestId, tx });
      return created;
    });
    return toTagDto(row);
  }

  async update(admin: ResolvedAdminContext, tagId: string, locales: TagLocaleInput[], requestId?: string): Promise<TagDto> {
    const existing = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!existing) throw new TagNotFoundException({ tagId });
    await this.assertSlugsAvailable(locales, tagId);

    const row = await this.prisma.$transaction(async (tx) => {
      for (const l of locales) {
        await tx.tagLocale.upsert({ where: { tagId_locale: { tagId, locale: l.locale } }, create: { tagId, ...l }, update: { name: l.name, slug: l.slug } });
      }
      const updated = await tx.tag.findUniqueOrThrow({ where: { id: tagId }, include: TAG_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "tag.updated", entityType: "TAG", entityId: tagId, requestId, tx });
      return updated;
    });
    return toTagDto(row);
  }

  private async assertSlugsAvailable(locales: TagLocaleInput[], excludeTagId?: string): Promise<void> {
    for (const l of locales) {
      const existing = await this.prisma.tagLocale.findUnique({ where: { locale_slug: { locale: l.locale, slug: l.slug } } });
      if (existing && existing.tagId !== excludeTagId) throw new DuplicateTagSlugException({ locale: l.locale, slug: l.slug });
    }
  }
}
