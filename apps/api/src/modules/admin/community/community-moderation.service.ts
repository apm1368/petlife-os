import { Injectable } from "@nestjs/common";
import { CommunityReportStatus, TrustCaseSeverity, TrustSubjectType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { TrustCaseService } from "../trust/trust-case.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CommunityReportNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { toCommunityReportDto } from "../../community/community-mapper";
import type { EscalateCommunityReportDto } from "../../community/dto/community.dto";

/**
 * Admin moderation queue for CommunityReport (spec: "reuse Trust & Safety /
 * Admin infrastructure. Do NOT create a separate moderation system") —
 * escalating a report opens the existing TrustCase machinery with
 * subjectType COMMUNITY_CONTENT; the actual content-hiding effect happens
 * when a TrustAction is later taken against that case
 * (TrustActionService.applyCommunityContentEffect), never here directly.
 */
@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly trustCases: TrustCaseService,
  ) {}

  async list(query: PaginationQueryDto & { status?: CommunityReportStatus }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.communityReport.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.communityReport.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toCommunityReportDto), total, page, pageSize);
  }

  async escalate(admin: ResolvedAdminContext, reportId: string, dto: EscalateCommunityReportDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await tx.communityReport.findUnique({ where: { id: reportId } });
      if (!report) throw new CommunityReportNotFoundException({ reportId });

      const subjectId = report.postId ?? report.commentId!;
      const trustCase = await this.trustCases.open(admin, { subjectType: TrustSubjectType.COMMUNITY_CONTENT, subjectId, reason: dto.reason, severity: TrustCaseSeverity.MEDIUM });

      const updated = await tx.communityReport.update({ where: { id: reportId }, data: { status: CommunityReportStatus.ESCALATED, trustCaseId: trustCase.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "community_report.escalated", entityType: "COMMUNITY_REPORT", entityId: reportId, reason: dto.reason, afterSummary: { trustCaseId: trustCase.id }, tx });
      await this.events.publish("CommunityContentModerated", { reportId, trustCaseId: trustCase.id, subjectId }, { tx, aggregateType: "CommunityPost", aggregateId: subjectId });
      return updated;
    });
    return toCommunityReportDto(row);
  }

  async dismiss(admin: ResolvedAdminContext, reportId: string, reason?: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await tx.communityReport.findUnique({ where: { id: reportId } });
      if (!report) throw new CommunityReportNotFoundException({ reportId });
      const updated = await tx.communityReport.update({ where: { id: reportId }, data: { status: CommunityReportStatus.DISMISSED } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "community_report.dismissed", entityType: "COMMUNITY_REPORT", entityId: reportId, reason, afterSummary: { status: "DISMISSED" }, tx });
      return updated;
    });
    return toCommunityReportDto(row);
  }
}
