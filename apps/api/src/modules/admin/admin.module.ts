import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RefundsModule } from "../commerce/refunds/refunds.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";
import { StorageModule } from "../storage/storage.module";
import { AdminAccessService } from "./auth/admin-access.service";
import { AdminAuthGuard } from "./auth/admin-auth.guard";
import { AdminMeController } from "./auth/admin-me.controller";
import { AdminAuditLogService } from "./audit/admin-audit-log.service";
import { AdminCustomerService } from "./customer/admin-customer.service";
import { AdminCustomerController } from "./customer/admin-customer.controller";
import { AdminSearchController } from "./customer/admin-search.controller";
import { InternalNoteService } from "./notes/internal-note.service";
import { AdminNoteController } from "./notes/admin-note.controller";
import { SupportCaseService } from "./support/support-case.service";
import { SupportCaseController } from "./support/support-case.controller";
import { SupportNotificationListener } from "./support/support-notification.listener";
import { DisputeService } from "./dispute/dispute.service";
import { DisputeController } from "./dispute/dispute.controller";
import { TrustCaseService } from "./trust/trust-case.service";
import { TrustActionService } from "./trust/trust-action.service";
import { TrustController } from "./trust/trust.controller";
import { AdminVerificationService } from "./verification/admin-verification.service";
import { AdminVerificationController } from "./verification/admin-verification.controller";
import { AdminTaskService } from "./task/admin-task.service";
import { AdminTaskController } from "./task/admin-task.controller";
import { AdminFinanceService } from "./finance/admin-finance.service";
import { AdminRefundService } from "./finance/admin-refund.service";
import { AdminFinanceController } from "./finance/admin-finance.controller";
import { AdminOrgService } from "./orgs/admin-org.service";
import { AdminOrgController } from "./orgs/admin-org.controller";
import { AdminAuditController } from "./audit/admin-audit.controller";
import { AdminDashboardService } from "./dashboard/admin-dashboard.service";
import { AdminDashboardController } from "./dashboard/admin-dashboard.controller";
import { AdminSellerSettlementService } from "./finance/admin-seller-settlement.service";
import { AdminSellerAdjustmentService } from "./finance/admin-seller-adjustment.service";
import { AdminMarketplaceSettlementService } from "./finance/admin-marketplace-settlement.service";
import { AdminSellerFinanceController } from "./finance/admin-seller-finance.controller";
import { AdminArticleService } from "./content/admin-article.service";
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
  imports: [NotificationsModule, RefundsModule, PetAccessModule, SellerFinanceModule, StorageModule, SubscriptionsModule],
  controllers: [
    AdminMeController,
    AdminNoteController,
    AdminCustomerController,
    AdminSearchController,
    SupportCaseController,
    DisputeController,
    TrustController,
    AdminVerificationController,
    AdminTaskController,
    AdminFinanceController,
    AdminOrgController,
    AdminAuditController,
    AdminDashboardController,
    AdminSellerFinanceController,
    AdminContentController,
    AdminSubscriptionController,
  ],
  providers: [
    AdminAccessService,
    AdminAuthGuard,
    AdminAuditLogService,
    AdminCustomerService,
    InternalNoteService,
    SupportCaseService,
    SupportNotificationListener,
    DisputeService,
    TrustCaseService,
    TrustActionService,
    AdminVerificationService,
    AdminTaskService,
    AdminFinanceService,
    AdminRefundService,
    AdminOrgService,
    AdminDashboardService,
    AdminSellerSettlementService,
    AdminSellerAdjustmentService,
    AdminMarketplaceSettlementService,
    AdminMediaService,
    AdminArticleService,
    AdminCategoryService,
    AdminTagService,
    AdminContentAuthorService,
    AdminContentVersionService,
    AdminContentPlacementService,
    AdminSubscriptionPlanService,
    AdminSubscriptionService,
  ],
  exports: [
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
