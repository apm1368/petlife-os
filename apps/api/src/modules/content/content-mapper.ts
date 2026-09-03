import type { AdminUser, Category, CategoryLocale, ContentAuthor, MediaAsset, Tag, TagLocale, User } from "@prisma/client";
import type { AdminActorSummaryDto, CategoryDto, ContentAuthorDto, MediaAssetDto, PublicCategoryDto, PublicTagDto, RichTextDocument, TagDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";

export const ADMIN_ACTOR_INCLUDE = { user: true } as const;
type AdminActorRow = AdminUser & { user: User };

export function toAdminActorDto(row: AdminActorRow): AdminActorSummaryDto {
  return { id: row.id, displayName: row.user.displayName, role: row.role as unknown as AdminActorSummaryDto["role"] };
}

export const MEDIA_ASSET_INCLUDE = { createdByAdmin: { include: ADMIN_ACTOR_INCLUDE } } as const;
type MediaAssetRow = MediaAsset & { createdByAdmin: AdminActorRow };

export function toMediaAssetDto(row: MediaAssetRow): MediaAssetDto {
  return {
    id: row.id,
    url: row.url,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    altText: row.altText,
    createdByAdmin: toAdminActorDto(row.createdByAdmin),
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const CONTENT_AUTHOR_INCLUDE = { avatarMediaAsset: { include: MEDIA_ASSET_INCLUDE } } as const;
type ContentAuthorRow = ContentAuthor & { avatarMediaAsset: MediaAssetRow | null };

export function toContentAuthorDto(row: ContentAuthorRow): ContentAuthorDto {
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    avatarMediaAsset: row.avatarMediaAsset ? toMediaAssetDto(row.avatarMediaAsset) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const CATEGORY_INCLUDE = { locales: true } as const;
type CategoryRow = Category & { locales: CategoryLocale[] };

export function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    locales: row.locales.map((l) => ({ locale: l.locale as unknown as CategoryDto["locales"][number]["locale"], name: l.name, slug: l.slug, description: l.description })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicCategoryDto(locale: CategoryLocale): PublicCategoryDto {
  return { id: locale.categoryId, name: locale.name, slug: locale.slug, description: locale.description };
}

export const TAG_INCLUDE = { locales: true } as const;
type TagRow = Tag & { locales: TagLocale[] };

export function toTagDto(row: TagRow): TagDto {
  return { id: row.id, locales: row.locales.map((l) => ({ locale: l.locale as unknown as TagDto["locales"][number]["locale"], name: l.name, slug: l.slug })) };
}

export function toPublicTagDto(locale: TagLocale): PublicTagDto {
  return { id: locale.tagId, name: locale.name, slug: locale.slug };
}

/**
 * Resolves every `image` block's `mediaAssetId` into a real `url` on the
 * way out (spec: renderer must show real images) — `url` is never stored
 * or accepted on write (see RichTextBlock's own doc comment in
 * @petlife/types); this is the one place it gets attached, on every read
 * path (admin locale read, public article read) alike, so the renderer
 * itself never has to look anything up.
 */
export async function resolveRichTextMedia(prisma: PrismaService, body: RichTextDocument): Promise<RichTextDocument> {
  const mediaAssetIds = [...new Set(body.filter((b) => b.type === "image").map((b) => b.mediaAssetId))];
  if (mediaAssetIds.length === 0) return body;
  const rows = await prisma.mediaAsset.findMany({ where: { id: { in: mediaAssetIds } } });
  const urlById = new Map(rows.map((r) => [r.id, r.url]));
  return body.map((block) => (block.type === "image" ? { ...block, url: urlById.get(block.mediaAssetId) } : block));
}
