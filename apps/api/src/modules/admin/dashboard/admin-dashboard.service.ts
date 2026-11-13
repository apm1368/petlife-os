import { Injectable } from "@nestjs/common";
import {
  AccountDeletionState,
  ProductReviewStatus,
  ProviderReviewStatus,
  TravelReviewStatus,
  AdminTaskSource,
  PetOwnershipTransferStatus,
  AdminRefundApprovalStatus,
  AdminTaskStatus,
  AdminRole,
  AdminVertical,
  BookingStatus,
  CardTransferDestinationStatus,
  CatalogProductRequestStatus,
  CommunityReportStatus,
  DisputeStatus,
  OrderRefundRequestStatus,
  PetMemorialStatus,
  PlaceReportStatus,
  PlaceSuggestionStatus,
  ProviderVerificationStatus,
  SellerOfferModerationStatus,
  SellerVerificationStatus,
  SetPetRequestStatus,
  SupportCaseStatus,
  SupportNeedStatus,
  TravelListingStatus,
  TrustCaseStatus,
  WalletAdjustmentRequestStatus,
  WalletTopUpStatus,
} from "@prisma/client";
import type { AdminDashboardSummaryDto, AdminLaunchKpisDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { adminCan, type AdminPermission } from "../auth/admin-permissions";
import { allowedProviderTypes, allowedVerticals, canReachVertical } from "../auth/admin-verticals";
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
      pendingPlaceSuggestions,
      pendingWalletTopUps,
      pendingWalletAdjustments,
      pendingDeletionRequests,
      launchKpis,
      openOwnershipDisputes,
      openProviderNoShows,
      pendingReviews,
      pendingCardDestinationChanges,
      newSetPetRequests,
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
      when(may("places.view"), () => this.prisma.placeSuggestion.count({ where: { status: PlaceSuggestionStatus.PENDING } })),
      // Same permission as the Wallets tab the badge sits on (a view-only admin sees the queue; reviewing needs more).
      when(may("wallet.view"), () => this.prisma.walletTopUp.count({ where: { status: WalletTopUpStatus.REVIEW_PENDING } })),
      // FE-16: wallet corrections waiting for a second admin (not yet lapsed); same tab permission as the top-ups.
      when(may("wallet.view"), () => this.prisma.walletAdjustmentRequest.count({ where: { status: WalletAdjustmentRequestStatus.PENDING, expiresAt: { gt: new Date() } } })),
      // Account deletion requests waiting on staff: new ones and those in retention review (execution stays disabled).
      when(may("admin.manage"), () => this.prisma.accountDeletionRequest.count({ where: { state: { in: [AccountDeletionState.REQUESTED, AccountDeletionState.PENDING_RETENTION] } } })),
      // Platform-wide figures: only for unscoped roles, so a vertical-limited role never sees other verticals' bookings.
      may("analytics.view") && allowedVerticals(admin) === null ? this.launchKpis() : Promise.resolve(null),
      // Pet ownership disputes waiting for staff to record an outcome (ID-03).
      when(may("customer.view"), () => this.prisma.petOwnershipTransfer.count({ where: { status: PetOwnershipTransferStatus.DISPUTED } })),
      // Members' provider no-show reports that staff haven't finished with (their automatic tasks still open).
      when(may("services.view"), () => this.prisma.adminTask.count({ where: { source: AdminTaskSource.PROVIDER_NO_SHOW, status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } })),
      // Reviews every vertical holds back until a moderator decides (service, product, stay), counted only for the
      // verticals this admin may moderate; service reviews also respect the provider-type scope.
      this.pendingReviewCount(admin, may),
      // BO-14: a proposed company card-to-card account waits on a second SUPER_ADMIN with settings.manage, the only
      // people who may approve or reject it; a proposal past its approval window no longer counts.
      when(admin.role === AdminRole.SUPER_ADMIN && may("settings.manage"), () =>
        this.prisma.cardTransferDestination.count({ where: { status: CardTransferDestinationStatus.PENDING, expiresAt: { gt: new Date() } } }),
      ),
      // «ست پت» orders members sent (or edited) that still need a print proof.
      when(may("commerce.view", AdminVertical.SHOP), () => this.prisma.setPetRequest.count({ where: { status: SetPetRequestStatus.SUBMITTED } })),
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
      pendingPlaceSuggestions,
      pendingWalletTopUps,
      pendingWalletAdjustments,
      pendingCardDestinationChanges,
      pendingDeletionRequests,
      launchKpis,
      openOwnershipDisputes,
      openProviderNoShows,
      pendingReviews,
      newSetPetRequests,
    };
  }

  /** #290 Q97: registered pets (not deleted) and live bookings created in this and the previous rolling week. */
  private async launchKpis(): Promise<AdminLaunchKpisDto> {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);
    const twoWeeksAgo = new Date(now - 14 * 24 * 3600 * 1000);
    const live = { bookingStatus: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.NO_SHOW] } };
    const [registeredPets, newPetsThisWeek, bookingsThisWeek, bookingsLastWeek] = await Promise.all([
      this.prisma.pet.count({ where: { deletedAt: null } }),
      this.prisma.pet.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
      this.prisma.booking.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
      this.prisma.booking.count({ where: { ...live, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    ]);
    return { registeredPets, newPetsThisWeek, bookingsThisWeek, bookingsLastWeek };
  }

  private async pendingReviewCount(admin: ResolvedAdminContext, may: (permission: AdminPermission, vertical?: AdminVertical) => boolean): Promise<number | null> {
    const types = allowedProviderTypes(admin);
    const service = may("services.view") && (types === null || types.length > 0);
    const product = may("commerce.view", AdminVertical.SHOP);
    const stay = may("travel.view", AdminVertical.ACCOMMODATION);
    if (!service && !product && !stay) return null;
    const [s, p, t] = await Promise.all([
      service ? this.prisma.providerReview.count({ where: { status: ProviderReviewStatus.PENDING, ...(types === null ? {} : { providerOrganization: { type: { in: types } } }) } }) : 0,
      product ? this.prisma.productReview.count({ where: { status: ProductReviewStatus.PENDING } }) : 0,
      stay ? this.prisma.travelReview.count({ where: { status: TravelReviewStatus.PENDING } }) : 0,
    ]);
    return s + p + t;
  }
}
