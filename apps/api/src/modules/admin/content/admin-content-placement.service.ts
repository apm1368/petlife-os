import { Injectable } from "@nestjs/common";
import { ContentPlacementKey, Locale, Prisma } from "@prisma/client";
import type { AdminContentBlockLocaleDto, AdminContentPlacementDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { InvalidRichTextContentException } from "../../../common/errors/api-exception";
import { isSafeHref } from "../../content/rich-text.util";
import { MEDIA_ASSET_INCLUDE, toAdminActorDto, toMediaAssetDto } from "../../content/content-mapper";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AdminMediaService } from "./admin-media.service";

export interface ContentBlockInput {
  sortOrder: number;
  linkedArticleId?: string;
  mediaAssetId?: string;
  locales: { locale: Locale; heading?: string; body?: string; ctaLabel?: string; ctaHref?: string }[];
}

const PLACEMENT_INCLUDE = {
  updatedByAdmin: { include: { user: true } },
  blocks: { include: { mediaAsset: { include: MEDIA_ASSET_INCLUDE }, locales: true }, orderBy: { sortOrder: "asc" as const } },
} as const;
type PlacementRow = Prisma.ContentPlacementGetPayload<{ include: typeof PLACEMENT_INCLUDE }>;

function toDto(row: PlacementRow): AdminContentPlacementDto {
  return {
    key: row.key as unknown as AdminContentPlacementDto["key"],
    updatedByAdmin: row.updatedByAdmin ? toAdminActorDto(row.updatedByAdmin) : null,
    updatedAt: row.updatedAt.toISOString(),
    blocks: row.blocks.map((b) => ({
      id: b.id,
      sortOrder: b.sortOrder,
      linkedArticleId: b.linkedArticleId,
      mediaAsset: b.mediaAsset ? toMediaAssetDto(b.mediaAsset) : null,
      locales: b.locales.map(
        (l): AdminContentBlockLocaleDto => ({ locale: l.locale as unknown as AdminContentBlockLocaleDto["locale"], heading: l.heading, body: l.body, ctaLabel: l.ctaLabel, ctaHref: l.ctaHref }),
      ),
    })),
  };
}

/**
 * Typed Landing/Home content hooks (spec: "typed placements... CMS controls
 * content, not visual architecture" — no layout/style field exists on
 * ContentBlock, structurally, so this can never become a page builder).
 * Codex's existing Landing visual implementation is untouched: nothing
 * reads this table until a future Landing/Home change deliberately does.
 * A placement's block list is replaced wholesale on every save (never a
 * partial patch) — with at most a handful of blocks per placement, a
 * delete-then-recreate inside one transaction is simpler and safer than
 * diffing sortOrder changes, and it is exactly what "reorder two blocks"
 * already requires anyway.
 */
@Injectable()
export class AdminContentPlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly media: AdminMediaService,
  ) {}

  async get(key: ContentPlacementKey): Promise<AdminContentPlacementDto> {
    const row = await this.getOrCreate(key);
    return toDto(row);
  }

  async listAll(): Promise<AdminContentPlacementDto[]> {
    const rows = await Promise.all(Object.values(ContentPlacementKey).map((key) => this.getOrCreate(key)));
    return rows.map(toDto);
  }

  async replaceBlocks(admin: ResolvedAdminContext, key: ContentPlacementKey, blocks: ContentBlockInput[], requestId?: string): Promise<AdminContentPlacementDto> {
    for (const block of blocks) {
      if (block.mediaAssetId) await this.media.assertSelectable(block.mediaAssetId);
      for (const l of block.locales) {
        if (l.ctaHref && !isSafeHref(l.ctaHref)) throw new InvalidRichTextContentException({ reason: "ctaHref must be an http(s) URL or a relative path", ctaHref: l.ctaHref });
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const placement = await this.getOrCreate(key, tx);
      await tx.contentBlock.deleteMany({ where: { placementId: placement.id } });
      for (const block of blocks) {
        await tx.contentBlock.create({
          data: {
            placementId: placement.id,
            sortOrder: block.sortOrder,
            linkedArticleId: block.linkedArticleId,
            mediaAssetId: block.mediaAssetId,
            locales: { create: block.locales.map((l) => ({ locale: l.locale, heading: l.heading, body: l.body, ctaLabel: l.ctaLabel, ctaHref: l.ctaHref })) },
          },
        });
      }
      await tx.contentPlacement.update({ where: { id: placement.id }, data: { updatedByAdminId: admin.adminUserId } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "content_placement.updated", entityType: "CONTENT_PLACEMENT", entityId: placement.id, afterSummary: { key, blockCount: blocks.length }, requestId, tx });
      return tx.contentPlacement.findUniqueOrThrow({ where: { id: placement.id }, include: PLACEMENT_INCLUDE });
    });
    return toDto(row);
  }

  private async getOrCreate(key: ContentPlacementKey, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<PlacementRow> {
    const existing = await client.contentPlacement.findUnique({ where: { key }, include: PLACEMENT_INCLUDE });
    if (existing) return existing;
    return client.contentPlacement.create({ data: { key }, include: PLACEMENT_INCLUDE });
  }
}
