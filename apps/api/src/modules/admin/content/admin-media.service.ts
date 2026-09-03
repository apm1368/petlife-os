import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MediaAssetDto, PaginatedDto } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MediaAssetDisabledException, MediaAssetNotFoundException, MediaTooLargeException, UnsupportedMediaTypeException } from "../../../common/errors/api-exception";
import type { UploadTarget } from "../../storage/storage-driver.interface";
import { StorageService } from "../../storage/storage.service";
import { MEDIA_ASSET_INCLUDE, toMediaAssetDto } from "../../content/content-mapper";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

const ALLOWED_MIME_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface ConfirmMediaUploadInput {
  key: string;
  url: string;
  mimeType: string;
  fileSizeBytes: number;
  altText?: string;
  widthPx?: number;
  heightPx?: number;
}

/**
 * CMS media (spec: "reuse the existing private object-storage architecture
 * where possible... strongly separate CMS media authorization from private
 * pet documents"). Two-step upload mirrors PetsController's own
 * photo-upload-url precedent exactly: request a signed target, upload the
 * bytes directly to storage, then confirm with the resulting key/URL —
 * this service never reads the uploaded bytes itself (no native
 * image-processing dependency this phase; widthPx/heightPx are supplied by
 * the confirming client, which already has the decoded image in-browser).
 */
@Injectable()
export class AdminMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async requestUpload(contentType: string): Promise<UploadTarget> {
    const extension = ALLOWED_MIME_TYPES[contentType];
    if (!extension) throw new UnsupportedMediaTypeException({ contentType, allowed: Object.keys(ALLOWED_MIME_TYPES) });
    return this.storage.createCmsMediaUploadTarget(contentType, extension);
  }

  async confirm(admin: ResolvedAdminContext, input: ConfirmMediaUploadInput, requestId?: string): Promise<MediaAssetDto> {
    if (!ALLOWED_MIME_TYPES[input.mimeType]) throw new UnsupportedMediaTypeException({ mimeType: input.mimeType, allowed: Object.keys(ALLOWED_MIME_TYPES) });
    const maxSize = this.config.get("CMS_MEDIA_MAX_SIZE_BYTES", { infer: true });
    if (input.fileSizeBytes > maxSize) throw new MediaTooLargeException({ fileSizeBytes: input.fileSizeBytes, maxSize });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          key: input.key,
          url: input.url,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
          widthPx: input.widthPx,
          heightPx: input.heightPx,
          altText: input.altText,
          createdByAdminId: admin.adminUserId,
        },
        include: MEDIA_ASSET_INCLUDE,
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "media_asset.uploaded", entityType: "MEDIA_ASSET", entityId: created.id, afterSummary: { mimeType: input.mimeType, fileSizeBytes: input.fileSizeBytes }, requestId, tx });
      return created;
    });
    return toMediaAssetDto(row);
  }

  async list(query: PaginationQueryDto): Promise<PaginatedDto<MediaAssetDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ include: MEDIA_ASSET_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.mediaAsset.count(),
    ]);
    return toPaginatedDto(rows.map(toMediaAssetDto), total, page, pageSize);
  }

  async get(mediaAssetId: string): Promise<MediaAssetDto> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId }, include: MEDIA_ASSET_INCLUDE });
    if (!row) throw new MediaAssetNotFoundException({ mediaAssetId });
    return toMediaAssetDto(row);
  }

  async updateMetadata(mediaAssetId: string, input: { altText?: string; widthPx?: number; heightPx?: number }): Promise<MediaAssetDto> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!existing) throw new MediaAssetNotFoundException({ mediaAssetId });

    const row = await this.prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: input, include: MEDIA_ASSET_INCLUDE });
    return toMediaAssetDto(row);
  }

  /** Never a hard delete (spec: "media deleted/disabled") — mirrors Pet.deletedAt's own precedent. An already-disabled asset's already-published usages keep resolving; a second disable call is a harmless no-op re-set of the same timestamp semantics, not an error, since there is nothing unsafe about disabling twice. */
  async disable(admin: ResolvedAdminContext, mediaAssetId: string, requestId?: string): Promise<MediaAssetDto> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!existing) throw new MediaAssetNotFoundException({ mediaAssetId });

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mediaAsset.update({ where: { id: mediaAssetId }, data: { disabledAt: existing.disabledAt ?? new Date() }, include: MEDIA_ASSET_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "media_asset.disabled", entityType: "MEDIA_ASSET", entityId: mediaAssetId, requestId, tx });
      return updated;
    });
    return toMediaAssetDto(row);
  }

  /** Called before attaching an asset to new content (cover image, author avatar, placement block) — a disabled asset's existing usages are untouched, but it can never be selected again. */
  async assertSelectable(mediaAssetId: string): Promise<void> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!row) throw new MediaAssetNotFoundException({ mediaAssetId });
    if (row.disabledAt) throw new MediaAssetDisabledException({ mediaAssetId });
  }
}
