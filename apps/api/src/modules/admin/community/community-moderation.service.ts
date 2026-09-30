import { Injectable } from "@nestjs/common";
import { CommunityReportStatus, TrustCaseSeverity, TrustCaseStatus, TrustSubjectType, type CommunityReport, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { TrustCaseService } from "../trust/trust-case.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CommunityReportNotFoundException, ReportNotOpenException } from "../../../common/errors/api-exception";
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
export type ReportTargetFilter = "COMMUNITY" | "SUPPORT_NEED" | "LOST_PET_INCIDENT" | "LOST_PET_SIGHTING" | "ORGANIZATION";

/** Batch 6 — every report target maps onto an existing TrustSubjectType, so one queue and one case machinery serve all surfaces. */
export function reportSubject(report: CommunityReport): { subjectType: TrustSubjectType; subjectId: string } {
  if (report.postId) return { subjectType: TrustSubjectType.COMMUNITY_CONTENT, subjectId: report.postId };
  if (report.commentId) return { subjectType: TrustSubjectType.COMMUNITY_CONTENT, subjectId: report.commentId };
  if (report.supportNeedListingId) return { subjectType: TrustSubjectType.SUPPORT_NEED, subjectId: report.supportNeedListingId };
  if (report.lostPetIncidentId) return { subjectType: TrustSubjectType.PET_INCIDENT, subjectId: report.lostPetIncidentId };
  if (report.lostPetSightingId) return { subjectType: TrustSubjectType.LOST_PET_SIGHTING, subjectId: report.lostPetSightingId };
  return { subjectType: TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION, subjectId: report.organizationId! };
}

const TARGET_WHERE: Record<ReportTargetFilter, Prisma.CommunityReportWhereInput> = {
  COMMUNITY: { OR: [{ postId: { not: null } }, { commentId: { not: null } }] },
  SUPPORT_NEED: { supportNeedListingId: { not: null } },
  LOST_PET_INCIDENT: { lostPetIncidentId: { not: null } },
  LOST_PET_SIGHTING: { lostPetSightingId: { not: null } },
  ORGANIZATION: { organizationId: { not: null } },
};

@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly trustCases: TrustCaseService,
  ) {}

  async list(query: PaginationQueryDto & { status?: CommunityReportStatus; targetType?: ReportTargetFilter }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.CommunityReportWhereInput = { status: query.status, ...(query.targetType ? TARGET_WHERE[query.targetType] : {}) };
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

      if (report.status !== CommunityReportStatus.OPEN) throw new ReportNotOpenException({ reportId });

      const { subjectType, subjectId } = reportSubject(report);
      // Several reports on the same subject share one active case rather than opening duplicates.
      const existing = await tx.trustCase.findFirst({ where: { subjectType, subjectId, status: { in: [TrustCaseStatus.OPEN, TrustCaseStatus.UNDER_REVIEW] } }, select: { id: true } });
      const trustCase = existing ?? (await this.trustCases.open(admin, { subjectType, subjectId, reason: dto.reason, severity: TrustCaseSeverity.MEDIUM }));

      const updated = await tx.communityReport.update({ where: { id: reportId }, data: { status: CommunityReportStatus.ESCALATED, trustCaseId: trustCase.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "community_report.escalated", entityType: "COMMUNITY_REPORT", entityId: reportId, reason: dto.reason, afterSummary: { trustCaseId: trustCase.id, subjectType, reusedCase: !!existing }, tx });
      if (subjectType === TrustSubjectType.COMMUNITY_CONTENT) {
        await this.events.publish("CommunityContentModerated", { reportId, trustCaseId: trustCase.id, subjectId }, { tx, aggregateType: "CommunityPost", aggregateId: subjectId });
      }
      return updated;
    });
    return toCommunityReportDto(row);
  }

  async dismiss(admin: ResolvedAdminContext, reportId: string, reason?: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await tx.communityReport.findUnique({ where: { id: reportId } });
      if (!report) throw new CommunityReportNotFoundException({ reportId });
      if (report.status !== CommunityReportStatus.OPEN) throw new ReportNotOpenException({ reportId });
      const updated = await tx.communityReport.update({ where: { id: reportId }, data: { status: CommunityReportStatus.DISMISSED } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "community_report.dismissed", entityType: "COMMUNITY_REPORT", entityId: reportId, reason, afterSummary: { status: "DISMISSED" }, tx });
      return updated;
    });
    return toCommunityReportDto(row);
  }
}
