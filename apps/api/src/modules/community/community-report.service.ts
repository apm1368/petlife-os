import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { CommunityPostService } from "./community-post.service";
import { toCommunityReportDto } from "./community-mapper";
import type { SubmitCommunityReportDto } from "./dto/community.dto";

/**
 * spec: "Reports should flow into existing moderation operations. Do NOT
 * create a separate moderation system." A CommunityReport is only the
 * user-facing submission — escalating it into the actual Trust & Safety
 * queue (TrustCase) is an admin action, handled by
 * CommunityModerationService in AdminModule (needs AdminAuditLogService,
 * so it lives there per the established public/admin split).
 */
@Injectable()
export class CommunityReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly posts: CommunityPostService,
  ) {}

  async reportPost(postId: string, reporterUserId: string, dto: SubmitCommunityReportDto) {
    await this.posts.getPostOrThrow(postId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityReport.create({ data: { postId, reporterUserId, reason: dto.reason, details: dto.details } });
      await this.events.publish("CommunityReportSubmitted", { reportId: created.id, postId, reason: dto.reason }, { tx, aggregateType: "CommunityPost", aggregateId: postId });
      return created;
    });
    return toCommunityReportDto(row);
  }

  async reportComment(commentId: string, reporterUserId: string, dto: SubmitCommunityReportDto) {
    const comment = await this.posts.getCommentOrThrow(commentId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityReport.create({ data: { commentId, reporterUserId, reason: dto.reason, details: dto.details } });
      await this.events.publish("CommunityReportSubmitted", { reportId: created.id, commentId, postId: comment.postId, reason: dto.reason }, { tx, aggregateType: "CommunityPost", aggregateId: comment.postId });
      return created;
    });
    return toCommunityReportDto(row);
  }
}
