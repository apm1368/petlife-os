import { Injectable } from "@nestjs/common";
import type { ContentAuthorDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ContentAuthorNotFoundException } from "../../../common/errors/api-exception";
import { CONTENT_AUTHOR_INCLUDE, toContentAuthorDto } from "../../content/content-mapper";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AdminMediaService } from "./admin-media.service";

export interface ContentAuthorInput {
  name: string;
  bio?: string;
  avatarMediaAssetId?: string;
}

/** The public byline (spec: "ContentAuthor") — see the model's own schema.prisma doc comment for why it is never the same identity as AdminUser. */
@Injectable()
export class AdminContentAuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly media: AdminMediaService,
  ) {}

  async list(): Promise<ContentAuthorDto[]> {
    const rows = await this.prisma.contentAuthor.findMany({ include: CONTENT_AUTHOR_INCLUDE, orderBy: { createdAt: "asc" } });
    return rows.map(toContentAuthorDto);
  }

  async create(admin: ResolvedAdminContext, input: ContentAuthorInput, requestId?: string): Promise<ContentAuthorDto> {
    if (input.avatarMediaAssetId) await this.media.assertSelectable(input.avatarMediaAssetId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contentAuthor.create({ data: input, include: CONTENT_AUTHOR_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "content_author.created", entityType: "CONTENT_AUTHOR", entityId: created.id, afterSummary: { name: input.name }, requestId, tx });
      return created;
    });
    return toContentAuthorDto(row);
  }

  async update(admin: ResolvedAdminContext, authorId: string, input: Partial<ContentAuthorInput>, requestId?: string): Promise<ContentAuthorDto> {
    const existing = await this.prisma.contentAuthor.findUnique({ where: { id: authorId } });
    if (!existing) throw new ContentAuthorNotFoundException({ authorId });
    if (input.avatarMediaAssetId) await this.media.assertSelectable(input.avatarMediaAssetId);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentAuthor.update({ where: { id: authorId }, data: input, include: CONTENT_AUTHOR_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "content_author.updated", entityType: "CONTENT_AUTHOR", entityId: authorId, requestId, tx });
      return updated;
    });
    return toContentAuthorDto(row);
  }
}
