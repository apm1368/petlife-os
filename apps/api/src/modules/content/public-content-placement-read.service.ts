import { Injectable } from "@nestjs/common";
import { ContentPlacementKey, Locale } from "@prisma/client";
import type { PublicContentBlockDto, PublicContentPlacementDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MEDIA_ASSET_INCLUDE, toMediaAssetDto } from "./content-mapper";
import { PublicContentReadService } from "./public-content-read.service";

/**
 * The public read side of the Handoff 15 Landing/Home content hooks (spec:
 * "typed content hooks that future product surfaces can consume"). Nothing
 * in Codex's existing Landing visual implementation calls this yet — it
 * exists so a future change can, without inventing a new API shape then.
 * A block whose `linkedArticleId` points at an article not VISIBLE in the
 * requested locale resolves to `linkedArticle: null` rather than leaking
 * a draft's existence or erroring the whole placement.
 */
@Injectable()
export class PublicContentPlacementReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: PublicContentReadService,
  ) {}

  async get(key: ContentPlacementKey, locale: Locale): Promise<PublicContentPlacementDto> {
    const placement = await this.prisma.contentPlacement.findUnique({
      where: { key },
      include: { blocks: { include: { mediaAsset: { include: MEDIA_ASSET_INCLUDE }, locales: { where: { locale } } }, orderBy: { sortOrder: "asc" } } },
    });
    if (!placement) return { key: key as unknown as PublicContentPlacementDto["key"], blocks: [] };

    const blocks: PublicContentBlockDto[] = await Promise.all(
      placement.blocks.map(async (block) => {
        const l = block.locales[0];
        return {
          id: block.id,
          sortOrder: block.sortOrder,
          heading: l?.heading ?? null,
          body: l?.body ?? null,
          ctaLabel: l?.ctaLabel ?? null,
          ctaHref: l?.ctaHref ?? null,
          linkedArticle: block.linkedArticleId ? await this.articles.getArticleReference(locale, block.linkedArticleId) : null,
          mediaAsset: block.mediaAsset ? toMediaAssetDto(block.mediaAsset) : null,
        };
      }),
    );
    return { key: key as unknown as PublicContentPlacementDto["key"], blocks };
  }
}
