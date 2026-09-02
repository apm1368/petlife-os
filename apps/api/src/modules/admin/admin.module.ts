import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RefundsModule } from "../commerce/refunds/refunds.module";
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
  imports: [NotificationsModule, RefundsModule],
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
  ],
  exports: [AdminAccessService, AdminAuthGuard, AdminAuditLogService, InternalNoteService],
})
export class AdminModule {}
