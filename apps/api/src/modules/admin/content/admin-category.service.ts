import { Injectable } from "@nestjs/common";
import type { Locale } from "@prisma/client";
import type { CategoryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CategoryNotFoundException, DuplicateCategorySlugException } from "../../../common/errors/api-exception";
import { CATEGORY_INCLUDE, toCategoryDto } from "../../content/content-mapper";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

export interface CategoryLocaleInput {
  locale: Locale;
  name: string;
  slug: string;
  description?: string;
}

/** Flat taxonomy CRUD (spec: "do not over-generalize into a completely arbitrary no-code page builder" applies to taxonomy too — no nesting). Both locales are edited on one screen, unlike Article — a category name is a single short string, not editorial content that benefits from independent per-locale drafting. */
@Injectable()
export class AdminCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({ include: CATEGORY_INCLUDE, orderBy: { createdAt: "asc" } });
    return rows.map(toCategoryDto);
  }

  async get(categoryId: string): Promise<CategoryDto> {
    const row = await this.prisma.category.findUnique({ where: { id: categoryId }, include: CATEGORY_INCLUDE });
    if (!row) throw new CategoryNotFoundException({ categoryId });
    return toCategoryDto(row);
  }

  async create(admin: ResolvedAdminContext, locales: CategoryLocaleInput[], requestId?: string): Promise<CategoryDto> {
    await this.assertSlugsAvailable(locales);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: { locales: { create: locales } }, include: CATEGORY_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "category.created", entityType: "CATEGORY", entityId: created.id, afterSummary: { locales: locales.map((l) => l.slug) }, requestId, tx });
      return created;
    });
    return toCategoryDto(row);
  }

  async update(admin: ResolvedAdminContext, categoryId: string, locales: CategoryLocaleInput[], requestId?: string): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id: categoryId }, include: CATEGORY_INCLUDE });
    if (!existing) throw new CategoryNotFoundException({ categoryId });
    await this.assertSlugsAvailable(locales, categoryId);

    const row = await this.prisma.$transaction(async (tx) => {
      for (const l of locales) {
        await tx.categoryLocale.upsert({
          where: { categoryId_locale: { categoryId, locale: l.locale } },
          create: { categoryId, ...l },
          update: { name: l.name, slug: l.slug, description: l.description },
        });
      }
      const updated = await tx.category.findUniqueOrThrow({ where: { id: categoryId }, include: CATEGORY_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "category.updated", entityType: "CATEGORY", entityId: categoryId, requestId, tx });
      return updated;
    });
    return toCategoryDto(row);
  }

  private async assertSlugsAvailable(locales: CategoryLocaleInput[], excludeCategoryId?: string): Promise<void> {
    for (const l of locales) {
      const existing = await this.prisma.categoryLocale.findUnique({ where: { locale_slug: { locale: l.locale, slug: l.slug } } });
      if (existing && existing.categoryId !== excludeCategoryId) throw new DuplicateCategorySlugException({ locale: l.locale, slug: l.slug });
    }
  }
}
