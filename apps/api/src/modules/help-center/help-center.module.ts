import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { HelpCenterService } from "./help-center.service";
import { LegalStatusService } from "./legal-status.service";
import { SupportEscalationService } from "./support-escalation.service";
import { PublicHelpController, PublicLegalController, PublicStatusController, SupportEscalationController } from "./help-center.controller";
import { AdminHelpCenterController, AdminLegalController, AdminStatusController } from "./admin-help-center.controller";

/**
 * Help Center, legal documents, system status and the support hand-off.
 *
 * Holds no SupportCase state of its own: like SupportModule it imports AdminModule only to reach the
 * services it exports (SupportCaseService for ownership and AdminAuditLogService for the audit trail), so
 * the one-directional dependency (HelpCenterModule -> AdminModule) cannot become circular.
 */
@Module({
  imports: [AdminModule],
  controllers: [
    PublicHelpController,
    PublicLegalController,
    PublicStatusController,
    SupportEscalationController,
    AdminHelpCenterController,
    AdminLegalController,
    AdminStatusController,
  ],
  providers: [HelpCenterService, LegalStatusService, SupportEscalationService],
})
export class HelpCenterModule {}
