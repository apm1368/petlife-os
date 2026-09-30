import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, CommunityReportStatus, LostPetIncidentStatus, Prisma, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { DuplicateReportException, NotFoundApiException, ReportLimitReachedException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { CommunityPostService } from "./community-post.service";
import { toCommunityReportDto } from "./community-mapper";
import type { SubmitCommunityReportDto } from "./dto/community.dto";

export type ReportTargetType = "SUPPORT_NEED" | "LOST_PET_INCIDENT" | "LOST_PET_SIGHTING" | "ORGANIZATION";

const OPEN_REPORT: CommunityReportStatus[] = [CommunityReportStatus.OPEN, CommunityReportStatus.ESCALATED];
const DAILY_REPORT_LIMIT = 20;

/**
 * spec: "Reports should flow into existing moderation operations. Do NOT
 * create a separate moderation system." A CommunityReport is only the
 * user-facing submission — escalating it into the actual Trust & Safety
 * queue (TrustCase) is an admin action. Batch 6: the same queue also takes
 * reports on animal-support needs, lost-pet incidents, sightings and
 * organizations, with duplicate protection (one open report per reporter per
 * target) and a daily cap per reporter.
 */
@Injectable()
export class CommunityReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly posts: CommunityPostService,
    private readonly petAccess: PetAccessService,
  ) {}

  private async guardAbuse(reporterUserId: string, target: Prisma.CommunityReportWhereInput) {
    const duplicate = await this.prisma.communityReport.findFirst({ where: { reporterUserId, status: { in: OPEN_REPORT }, ...target }, select: { id: true } });
    if (duplicate) throw new DuplicateReportException({ reportId: duplicate.id });
    const today = await this.prisma.communityReport.count({ where: { reporterUserId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= DAILY_REPORT_LIMIT) throw new ReportLimitReachedException();
  }

  async reportPost(postId: string, reporterUserId: string, dto: SubmitCommunityReportDto) {
    await this.posts.getPostOrThrow(postId);
    await this.guardAbuse(reporterUserId, { postId });
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityReport.create({ data: { postId, reporterUserId, reason: dto.reason, details: dto.details } });
      await this.events.publish("CommunityReportSubmitted", { reportId: created.id, postId, reason: dto.reason }, { tx, aggregateType: "CommunityPost", aggregateId: postId });
      return created;
    });
    return toCommunityReportDto(row);
  }

  async reportComment(commentId: string, reporterUserId: string, dto: SubmitCommunityReportDto) {
    const comment = await this.posts.getCommentOrThrow(commentId);
    await this.guardAbuse(reporterUserId, { commentId });
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityReport.create({ data: { commentId, reporterUserId, reason: dto.reason, details: dto.details } });
      await this.events.publish("CommunityReportSubmitted", { reportId: created.id, commentId, postId: comment.postId, reason: dto.reason }, { tx, aggregateType: "CommunityPost", aggregateId: comment.postId });
      return created;
    });
    return toCommunityReportDto(row);
  }

  /** Batch 6 — reports on the other public surfaces. Only targets the reporter can actually see are accepted. */
  async reportTarget(targetType: ReportTargetType, targetId: string, reporterUserId: string, dto: SubmitCommunityReportDto) {
    let data: Prisma.CommunityReportUncheckedCreateInput;
    if (targetType === "SUPPORT_NEED") {
      const visible: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.FULFILLED, SupportNeedStatus.PAUSED];
      const row = await this.prisma.supportNeedListing.findFirst({ where: { id: targetId, status: { in: visible } }, select: { id: true } });
      if (!row) throw new NotFoundApiException("Listing");
      data = { supportNeedListingId: targetId, reporterUserId, reason: dto.reason, details: dto.details };
    } else if (targetType === "LOST_PET_INCIDENT") {
      const visible: LostPetIncidentStatus[] = [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.REUNITED];
      const row = await this.prisma.lostPetIncident.findFirst({ where: { id: targetId, status: { in: visible } }, select: { id: true } });
      if (!row) throw new NotFoundApiException("Incident");
      data = { lostPetIncidentId: targetId, reporterUserId, reason: dto.reason, details: dto.details };
    } else if (targetType === "LOST_PET_SIGHTING") {
      // Sightings are private to the incident's household, so only its members can report one (e.g. spam or abuse).
      const row = await this.prisma.lostPetSighting.findUnique({ where: { id: targetId }, select: { id: true, incident: { select: { petId: true } } } });
      if (!row || !(await this.petAccess.hasActiveAccess(row.incident.petId, reporterUserId))) throw new NotFoundApiException("Sighting");
      data = { lostPetSightingId: targetId, reporterUserId, reason: dto.reason, details: dto.details };
    } else {
      const row = await this.prisma.animalSupportOrganization.findFirst({ where: { id: targetId, isPubliclyListed: true, verificationStatus: { not: AnimalSupportVerificationStatus.NOT_STARTED } }, select: { id: true } });
      if (!row) throw new NotFoundApiException("Organization");
      data = { organizationId: targetId, reporterUserId, reason: dto.reason, details: dto.details };
    }
    const { reporterUserId: _r, reason: _reason, details: _d, ...target } = data;
    void _r;
    void _reason;
    void _d;
    await this.guardAbuse(reporterUserId, target as Prisma.CommunityReportWhereInput);
    const created = await this.prisma.$transaction(async (tx) => {
      const report = await tx.communityReport.create({ data });
      await this.events.publish("ContentReportSubmitted", { reportId: report.id, targetType, targetId, reason: dto.reason }, { tx, aggregateType: "CommunityReport", aggregateId: report.id });
      return report;
    });
    return toCommunityReportDto(created);
  }
}
