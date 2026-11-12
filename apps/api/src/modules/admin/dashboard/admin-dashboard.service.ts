import { Injectable } from "@nestjs/common";
import {
  AccountDeletionState,
  AdminRefundApprovalStatus,
  AdminTaskStatus,
  AdminVertical,
  CatalogProductRequestStatus,
  CommunityReportStatus,
  DisputeStatus,
  OrderRefundRequestStatus,
  PetMemorialStatus,
  PlaceReportStatus,
  ProviderVerificationStatus,
  SellerOfferModerationStatus,
  SellerVerificationStatus,
  SupportCaseStatus,
  SupportNeedStatus,
  TravelListingStatus,
  TrustCaseStatus,
  WalletTopUpStatus,
} from "@prisma/client";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { adminCan, type AdminPermission } from "../auth/admin-permissions";
import { canReachVertical } from "../auth/admin-verticals";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/**
 * Backs the /admin landing view — small counts only, never a list (spec: "avoid disconnected tables"; each
 * count links into its own paginated list view in the frontend). Every count is a queue that waits on staff,
 * gated by the same permission (and vertical) as the list it opens; null means "not yours to see", never zero.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(admin: ResolvedAdminContext): Promise<AdminDashboardSummaryDto> {
    const may = (permission: AdminPermission, vertical?: AdminVertical) =>
      adminCan(admin, permission) && (!vertical || canReachVertical(admin, vertical));
    const when = (allowed: boolean, count: () => Promise<number>) => (allowed ? count() : Promise.resolve(null));
    const awaitingStaff = [ProviderVerificationStatus.SUBMITTED, ProviderVerificationStatus.UNDER_REVIEW];
    const [
      openSupportCases,
      openDisputes,
      openTrustCases,
      pendingRefundApprovals,
      openTasks,
      pendingVerifications,
      pendingRefundRequests,
      pendingOfferModeration,
      pendingCatalogRequests,
      pendingTravelListings,
      pendingSupportNeeds,
      openCommunityReports,
      pendingMemorials,
      openPlaceReports,
      pendingWalletTopUps,
      pendingDeletionRequests,
    ] = await Promise.all([
      when(may("support.view"), () => this.prisma.supportCase.count({ where: { status: { notIn: [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED] } } })),
      when(may("dispute.view"), () => this.prisma.dispute.count({ where: { status: { notIn: [DisputeStatus.CLOSED] } } })),
      when(may("trust.view"), () => this.prisma.trustCase.count({ where: { status: { notIn: [TrustCaseStatus.CLOSED] } } })),
      when(may("finance.view"), () => this.prisma.adminRefundApproval.count({ where: { status: { in: [AdminRefundApprovalStatus.REQUESTED, AdminRefundApprovalStatus.APPROVED] } } })),
      when(may("task.manage"), () => this.prisma.adminTask.count({ where: { status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } })),
      when(may("verification.manage"), async () => {
        const [providers, sellers] = await Promise.all([
          this.prisma.providerOrganization.count({ where: { verificationStatus: { in: awaitingStaff } } }),
          this.prisma.sellerOrganization.count({ where: { verificationStatus: { in: [SellerVerificationStatus.SUBMITTED, SellerVerificationStatus.UNDER_REVIEW] } } }),
        ]);
        return providers + sellers;
      }),
      when(may("commerce.view", AdminVertical.SHOP), () => this.prisma.orderRefundRequest.count({ where: { status: OrderRefundRequestStatus.PENDING_REVIEW } })),
      when(may("commerce.view", AdminVertical.SHOP), () => this.prisma.sellerOffer.count({ where: { moderationStatus: SellerOfferModerationStatus.PENDING_REVIEW } })),
      when(may("commerce.view", AdminVertical.SHOP), () => this.prisma.catalogProductRequest.count({ where: { status: CatalogProductRequestStatus.PENDING_REVIEW } })),
      when(may("travel.view", AdminVertical.ACCOMMODATION), () => this.prisma.travelListing.count({ where: { status: TravelListingStatus.PENDING_REVIEW } })),
      when(may("trust.view"), () => this.prisma.supportNeedListing.count({ where: { status: SupportNeedStatus.PENDING_REVIEW } })),
      when(may("trust.view"), () => this.prisma.communityReport.count({ where: { status: { in: [CommunityReportStatus.OPEN, CommunityReportStatus.ESCALATED] } } })),
      when(may("trust.view"), () => this.prisma.petMemorialSubmission.count({ where: { status: PetMemorialStatus.PENDING_REVIEW, withdrawnAt: null } })),
      when(may("places.view"), () => this.prisma.placeReport.count({ where: { status: PlaceReportStatus.OPEN } })),
      // Same permission as the Wallets tab the badge sits on (a view-only admin sees the queue; reviewing needs more).
      when(may("wallet.view"), () => this.prisma.walletTopUp.count({ where: { status: WalletTopUpStatus.REVIEW_PENDING } })),
      // Account deletion requests waiting on staff: new ones and those in retention review (execution stays disabled).
      when(may("admin.manage"), () => this.prisma.accountDeletionRequest.count({ where: { state: { in: [AccountDeletionState.REQUESTED, AccountDeletionState.PENDING_RETENTION] } } })),
    ]);
    return {
      openSupportCases,
      openDisputes,
      openTrustCases,
      pendingRefundApprovals,
      openTasks,
      pendingVerifications,
      pendingRefundRequests,
      pendingOfferModeration,
      pendingCatalogRequests,
      pendingTravelListings,
      pendingSupportNeeds,
      openCommunityReports,
      pendingMemorials,
      openPlaceReports,
      pendingWalletTopUps,
      pendingDeletionRequests,
    };
  }
}
