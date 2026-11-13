import { AdminInsuranceApplicationsController } from "./insurance/admin-insurance-applications.controller";
import { OrdersModule } from "../commerce/orders/orders.module";
import { AdminTravelController } from "./travel/admin-travel.controller";
import { AdminTravelService } from "./travel/admin-travel.service";
import { TravelMarketplaceModule } from "../travel-marketplace/travel-marketplace.module";
import { AdminCommerceController } from "./commerce/admin-commerce.controller";
import { AdminCommerceService } from "./commerce/admin-commerce.service";
import { SellerCatalogReviewService } from "./commerce/seller-catalog-review.service";
import { CatalogImportService } from "./commerce/catalog-import.service";
import { CatalogImportWorker } from "./commerce/catalog-import.worker";
import { PromotionsModule } from "../commerce/promotions/promotions.module";
import { Module } from "@nestjs/common";
import { SupportOpsService } from "./support/support-ops.service";
import {
  AdminSupportOpsController,
  UserSupportAttachmentsController,
} from "./support/support-ops.controller";
import { DisputeOutcomeService } from "./dispute/dispute-outcome.service";
import { FinanceReconciliationService } from "./finance/finance-reconciliation.service";
import { FinanceReconciliationWorker } from "./finance/finance-reconciliation.worker";
import { PaymentTraceService } from "./finance/payment-trace.service";
import { SettlementOpsService } from "./finance/settlement-ops.service";
import { AdminFinanceOpsController } from "./finance/finance-ops.controller";
import { AutomaticTaskListener } from "./task/automatic-task.listener";
import { AdminPartner360Service } from "./partners/admin-partner360.service";
import { AdminPartner360Controller } from "./partners/admin-partner360.controller";
import { AdminPartnerDirectoryController } from "./partners/admin-partner-directory.controller";
import { AdminPartnerDirectoryService } from "./partners/admin-partner-directory.service";
import { AutomaticTaskService } from "./task/automatic-task.service";
import { AdminPet360Service } from "./pets/admin-pet360.service";
import { AdminPet360Controller } from "./pets/admin-pet360.controller";
import { AdminCustomerOverviewService } from "./customer/admin-customer-overview.service";
import { AdminAccessControlService } from "./access/admin-access-control.service";
import { AdminAccessControlController } from "./access/admin-access-control.controller";
import { AdminCustomRolesController } from "./access/admin-custom-roles.controller";
import { AdminCustomRolesService } from "./access/admin-custom-roles.service";
import { AdminSettingsService } from "./settings/admin-settings.service";
import { AdminSettingsController } from "./settings/admin-settings.controller";
import { AdminFeatureFlagsController } from "./feature-flags/admin-feature-flags.controller";
import { AdminFeatureFlagsService } from "./feature-flags/admin-feature-flags.service";
import { AdminSmsPatternsController } from "./sms-patterns/admin-sms-patterns.controller";
import { AdminSmsPatternsService } from "./sms-patterns/admin-sms-patterns.service";
import { AdminSystemService } from "./system/admin-system.service";
import { AdminSystemController } from "./system/admin-system.controller";
import { BookingModule } from "../booking/booking.module";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { AdminCardTransferController } from "./finance/admin-card-transfer.controller";
import { AdminShippingController } from "./commerce/admin-shipping.controller";
import { LogisticsModule } from "../commerce/logistics/logistics.module";
import { AdminPlacesOsmController } from "./places/admin-places-osm.controller";
import { OsmDirectoryService } from "../places/osm/osm-directory.service";
import { PlaceClaimsService } from "../places/osm/place-claims.service";
import { AdminWalletsController } from "./finance/admin-wallets.controller";
import { AdminCardTransferDestinationController } from "./finance/admin-card-transfer-destination.controller";
import { AdminCardTransferDestinationService } from "./finance/admin-card-transfer-destination.service";
import { AdminCardTransferReceiptsService } from "./finance/admin-card-transfer-receipts.service";
import { ReceiptReviewNotifier } from "./finance/receipt-review.notifier";
import { AdminWalletsService } from "./finance/admin-wallets.service";
import { AdminServicesService } from "./services/admin-services.service";
import { AdminServicesController } from "./services/admin-services.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { RefundsModule } from "../commerce/refunds/refunds.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";
import { StorageModule } from "../storage/storage.module";
import { AdminAccessService } from "./auth/admin-access.service";
import { AdminAuthGuard } from "./auth/admin-auth.guard";
import { AdminMeController } from "./auth/admin-me.controller";
import { AdminTwoStepController } from "./two-step/admin-two-step.controller";
import { AdminTwoStepService } from "./two-step/admin-two-step.service";
import { AdminCalendarController } from "./calendar/admin-calendar.controller";
import { AdminCalendarService } from "./calendar/admin-calendar.service";
import { AdminOwnershipController } from "./ownership/admin-ownership.controller";
import { AdminOwnershipService } from "./ownership/admin-ownership.service";
import { AdminAuditLogService } from "./audit/admin-audit-log.service";
import { AdminCustomerService } from "./customer/admin-customer.service";
import { AdminCustomerController } from "./customer/admin-customer.controller";
import { AdminUsersService } from "./users/admin-users.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminSearchController } from "./customer/admin-search.controller";
import { InternalNoteService } from "./notes/internal-note.service";
import { AdminNoteController } from "./notes/admin-note.controller";
import { SupportCaseService } from "./support/support-case.service";
import { SupportCaseController } from "./support/support-case.controller";
import { SupportNotificationListener } from "./support/support-notification.listener";
import { DisputeService } from "./dispute/dispute.service";
import { DisputeController } from "./dispute/dispute.controller";
import { TrustCaseService } from "./trust/trust-case.service";
import { TrustCaseContextService } from "./trust/trust-case-context.service";
import { TrustActionService } from "./trust/trust-action.service";
import { TrustController } from "./trust/trust.controller";
import { TrustQueueController } from "./trust/trust-queue.controller";
import { TrustQueueService } from "./trust/trust-queue.service";
import { AdminTaskService } from "./task/admin-task.service";
import { AdminTaskController } from "./task/admin-task.controller";
import { AdminFinanceService } from "./finance/admin-finance.service";
import { AdminRefundService } from "./finance/admin-refund.service";
import { AdminBookingMoneyService } from "./finance/admin-booking-money.service";
import { AdminFinanceController } from "./finance/admin-finance.controller";
import { AdminOrgService } from "./orgs/admin-org.service";
import { AdminOrgController } from "./orgs/admin-org.controller";
import { AdminAuditController } from "./audit/admin-audit.controller";
import { AdminDashboardService } from "./dashboard/admin-dashboard.service";
import { AdminReportsService } from "./reports/admin-reports.service";
import { AdminReportsController } from "./reports/admin-reports.controller";
import { AdminMessagingService } from "./messaging/admin-messaging.service";
import { AdminMessagingController } from "./messaging/admin-messaging.controller";
import { EmailModule } from "../../common/email/email.module";
import { AdminDashboardController } from "./dashboard/admin-dashboard.controller";
import { AdminSellerSettlementService } from "./finance/admin-seller-settlement.service";
import { AdminSellerAdjustmentService } from "./finance/admin-seller-adjustment.service";
import { AdminMarketplaceSettlementService } from "./finance/admin-marketplace-settlement.service";
import { AdminSellerFinanceController } from "./finance/admin-seller-finance.controller";
import { AdminArticleService } from "./content/admin-article.service";
import { IndexNowService } from "../content/indexnow.service";
import { AdminCategoryService } from "./content/admin-category.service";
import { AdminTagService } from "./content/admin-tag.service";
import { AdminContentAuthorService } from "./content/admin-content-author.service";
import { AdminMediaService } from "./content/admin-media.service";
import { AdminContentVersionService } from "./content/admin-content-version.service";
import { AdminContentPlacementService } from "./content/admin-content-placement.service";
import { AdminContentController } from "./content/admin-content.controller";
import { SubscriptionsModule } from "../subscriptions/subscription.module";
import { AdminSubscriptionPlanService } from "./subscriptions/admin-subscription-plan.service";
import { AdminSubscriptionService } from "./subscriptions/admin-subscription.service";
import { AdminSubscriptionController } from "./subscriptions/admin-subscription.controller";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { CommunityModule } from "../community/community.module";
import { AnimalSupportOrganizationService } from "../animal-support/animal-support-organization.service";
import { RescueCaseService } from "../animal-support/rescue-case.service";
import { SupportCampaignService } from "../animal-support/support-campaign.service";
import { DonationLedgerService } from "../animal-support/donation-ledger.service";
import { AdminDonationService } from "../animal-support/admin-donation.service";
import { AdminAnimalSupportController } from "./animal-support/admin-animal-support.controller";
import { CommunityModerationService } from "./community/community-moderation.service";
import { AdminCommunityController } from "./community/admin-community.controller";
import { SupportNeedModerationService } from "./animal-support/support-need-moderation.service";
import { AdminAnimalSupportOpsService } from "./animal-support/admin-animal-support-ops.service";
import { AdminSupportNeedController } from "./animal-support/admin-support-need.controller";
import { InsuranceProviderService } from "../insurance/insurance-provider.service";
import { InsuranceProductService } from "../insurance/insurance-product.service";
import { AdminInsuranceController } from "./insurance/admin-insurance.controller";
import { PetFriendlyPlaceService } from "../places/pet-friendly-place.service";
import { AdminPlacesController } from "./places/admin-places.controller";
import { AdminLostPetController } from "./lost-pet/admin-lost-pet.controller";
import { AdminNgoMembersController } from "./animal-support/admin-ngo-members.controller";
import { AdminLostPetService } from "./lost-pet/admin-lost-pet.service";
import { AdminReviewModerationController } from "./reviews/admin-review-moderation.controller";
import { AdminReviewModerationService } from "./reviews/admin-review-moderation.service";
import { AdminPetMemorialController } from "./memorials/admin-pet-memorial.controller";
import { AdminPetMemorialService } from "./memorials/admin-pet-memorial.service";
import { MemoriesModule } from "../memories/memories.module";

/**
 * The internal-platform module (Handoff 11) — identity/auth, audit
 * logging, Customer/Household/Pet 360 + search, Support Cases, Disputes,
 * Trust & Safety + verification overrides, Tasks, and minimal financial
 * visibility + the two-person-control refund flow. The Admin REST surface
 * this module exposes is deliberately its own namespace (/admin/*),
 * entirely behind AdminAuthGuard — never reachable through any
 * consumer/seller/provider route.
 */
@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    RefundsModule,
    OrdersModule,
    PromotionsModule,
    TravelMarketplaceModule,
    PetAccessModule,
    SellerFinanceModule,
    StorageModule,
    SubscriptionsModule,
    LedgerModule,
    CommunityModule,
    BookingModule,
    PaymentsModule,
    LogisticsModule,
    MemoriesModule,
  ],
  controllers: [
    AdminReportsController,
    AdminMessagingController,
    AdminMeController,
    AdminTwoStepController,
    AdminCalendarController,
    AdminOwnershipController,
    AdminSupportOpsController,
    UserSupportAttachmentsController,
    AdminFinanceOpsController,
    AdminCardTransferController,
    AdminShippingController,
    AdminPlacesOsmController,
    AdminWalletsController,
    AdminCardTransferDestinationController,
    AdminPartner360Controller,
    AdminPartnerDirectoryController,
    AdminPet360Controller,
    AdminAccessControlController,
    AdminCustomRolesController,
    AdminSettingsController,
    AdminFeatureFlagsController,
    AdminSmsPatternsController,
    AdminSystemController,
    AdminNoteController,
    AdminCustomerController,
    AdminUsersController,
    AdminSearchController,
    SupportCaseController,
    DisputeController,
    TrustController,
    TrustQueueController,
    AdminTaskController,
    AdminFinanceController,
    AdminOrgController,
    AdminAuditController,
    AdminDashboardController,
    AdminSellerFinanceController,
    AdminContentController,
    AdminSubscriptionController,
    AdminAnimalSupportController,
    AdminCommunityController,
    AdminSupportNeedController,
    AdminInsuranceController,
    AdminPlacesController,
    AdminServicesController,
    AdminCommerceController,
    AdminTravelController,
    AdminInsuranceApplicationsController,
    AdminLostPetController,
    AdminNgoMembersController,
    AdminReviewModerationController,
    AdminPetMemorialController,
  ],
  providers: [
    AdminReportsService,
    AdminMessagingService,
    SupportOpsService,
    DisputeOutcomeService,
    FinanceReconciliationService,
    FinanceReconciliationWorker,
    PaymentTraceService,
    SettlementOpsService,
    AutomaticTaskListener,
    AdminPartner360Service,
    AdminPartnerDirectoryService,
    AutomaticTaskService,
    AdminPet360Service,
    AdminCustomerOverviewService,
    AdminAccessControlService,
    AdminTwoStepService,
    AdminCalendarService,
    AdminOwnershipService,
    AdminCustomRolesService,
    AdminSettingsService,
    AdminFeatureFlagsService,
    AdminSmsPatternsService,
    AdminSystemService,
    AdminServicesService,
    AdminLostPetService,
    AdminTravelService,
    AdminCommerceService,
    SellerCatalogReviewService,
    CatalogImportService,
    CatalogImportWorker,
    AdminAccessService,
    AdminAuthGuard,
    AdminAuditLogService,
    AdminCustomerService,
    AdminUsersService,
    AdminReviewModerationService,
    AdminPetMemorialService,
    InternalNoteService,
    SupportCaseService,
    SupportNotificationListener,
    DisputeService,
    TrustCaseService,
    TrustCaseContextService,
    TrustQueueService,
    TrustActionService,
    AdminTaskService,
    AdminFinanceService,
    AdminRefundService,
    AdminBookingMoneyService,
    AdminOrgService,
    AdminDashboardService,
    OsmDirectoryService,
    PlaceClaimsService,
    AdminWalletsService,
    AdminCardTransferDestinationService,
    AdminCardTransferReceiptsService,
    ReceiptReviewNotifier,
    AdminSellerSettlementService,
    AdminSellerAdjustmentService,
    AdminMarketplaceSettlementService,
    AdminMediaService,
    AdminArticleService,
    IndexNowService,
    AdminCategoryService,
    AdminTagService,
    AdminContentAuthorService,
    AdminContentVersionService,
    AdminContentPlacementService,
    AdminSubscriptionPlanService,
    AdminSubscriptionService,
    AnimalSupportOrganizationService,
    RescueCaseService,
    SupportCampaignService,
    DonationLedgerService,
    AdminDonationService,
    CommunityModerationService,
    SupportNeedModerationService,
    AdminAnimalSupportOpsService,
    InsuranceProviderService,
    InsuranceProductService,
    PetFriendlyPlaceService,
  ],
  exports: [
    AutomaticTaskService,
    AdminAccessService,
    AdminAuthGuard,
    AdminAuditLogService,
    InternalNoteService,
    SupportCaseService,
    AdminSellerSettlementService,
    AdminSellerAdjustmentService,
    AdminMarketplaceSettlementService,
  ],
})
export class AdminModule {}
