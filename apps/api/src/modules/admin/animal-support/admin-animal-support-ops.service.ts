import { Injectable } from "@nestjs/common";
import { CommunityReportStatus, DonationStatus, LostPetIncidentStatus, type Prisma, SupportNeedStatus, TrustCaseStatus, TrustSubjectType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";

const ANIMAL_TRUST_SUBJECTS: TrustSubjectType[] = [TrustSubjectType.SUPPORT_NEED, TrustSubjectType.PET_INCIDENT, TrustSubjectType.LOST_PET_SIGHTING, TrustSubjectType.ANIMAL_SUPPORT_ORGANIZATION, TrustSubjectType.COMMUNITY_CONTENT];

/**
 * Batch 6 — read models for the admin animal-support console: an overview of
 * what needs attention (every number is a live count, nothing estimated) and
 * the donations list the refund action works from. Donors appear by account
 * display name only; no contact details.
 */
@Injectable()
export class AdminAnimalSupportOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [pendingListings, liveListings, orgsAwaitingReview, verifiedOrgs, openReports, openIncidents, openCases, donations30, refunds30] = await Promise.all([
      this.prisma.supportNeedListing.count({ where: { status: SupportNeedStatus.PENDING_REVIEW } }),
      this.prisma.supportNeedListing.count({ where: { status: { in: [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED] } } }),
      this.prisma.animalSupportOrganization.count({ where: { verificationStatus: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      this.prisma.animalSupportOrganization.count({ where: { verificationStatus: "VERIFIED" } }),
      this.prisma.communityReport.count({ where: { status: CommunityReportStatus.OPEN } }),
      this.prisma.lostPetIncident.count({ where: { status: { in: [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED] } } }),
      this.prisma.trustCase.count({ where: { status: { in: [TrustCaseStatus.OPEN, TrustCaseStatus.UNDER_REVIEW] }, subjectType: { in: ANIMAL_TRUST_SUBJECTS } } }),
      this.prisma.donationIntent.aggregate({ where: { status: DonationStatus.SUCCEEDED, succeededAt: { gte: since } }, _sum: { amountIrr: true }, _count: true }),
      this.prisma.donationIntent.count({ where: { status: DonationStatus.REFUNDED, refundedAt: { gte: since } } }),
    ]);
    return {
      needsAttention: { pendingListings, orgsAwaitingReview, openReports, openTrustCases: openCases },
      live: { liveListings, verifiedOrgs, openLostPetIncidents: openIncidents },
      donationsLast30Days: { count: donations30._count, amountIrr: donations30._sum.amountIrr ?? 0, refunded: refunds30 },
    };
  }

  async listDonations(query: PaginationQueryDto & { status?: DonationStatus; organizationId?: string; campaignId?: string }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.DonationIntentWhereInput = {
      status: query.status,
      campaignId: query.campaignId,
      ...(query.organizationId ? { campaign: { organizationId: query.organizationId } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.donationIntent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { campaign: { select: { id: true, title: true, organization: { select: { id: true, name: true } } } } } }),
      this.prisma.donationIntent.count({ where }),
    ]);
    const donorIds = [...new Set(rows.map((r) => r.donorUserId).filter((id): id is string => Boolean(id)))];
    const donors = new Map((await this.prisma.user.findMany({ where: { id: { in: donorIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return toPaginatedDto(
      rows.map((r) => ({
        id: r.id,
        amountIrr: r.amountIrr,
        fundType: r.fundType,
        status: r.status,
        campaign: { id: r.campaign.id, title: r.campaign.title },
        organization: r.campaign.organization,
        donorName: r.donorUserId ? donors.get(r.donorUserId) ?? null : null,
        publicDisplayName: r.showDonorPublicly ? r.publicDisplayName : null,
        createdAt: r.createdAt.toISOString(),
        succeededAt: r.succeededAt?.toISOString() ?? null,
        refundedAt: r.refundedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    );
  }
}
