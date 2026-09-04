import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PublicInsuranceReadService } from "./public-insurance-read.service";
import { EligibilityService } from "./eligibility.service";
import { InsuranceApplicationService } from "./insurance-application.service";
import { InsuranceNotificationListener } from "./insurance-notification.listener";
import { InsuranceController } from "./insurance.controller";
import { PublicInsuranceController } from "./public-insurance.controller";

/**
 * The public/consumer half of the Handoff 19 Insurance domain — read-only
 * provider/product directory, comparison, plus a household's own
 * eligibility check and applications. The admin-mutating half
 * (InsuranceProviderService/InsuranceProductService — create/update/
 * verify/list) lives directly in AdminModule (`admin/insurance/`) since
 * both need AdminAuditLogService — the exact layering AnimalSupportModule
 * already established for Handoff 18. There is no import relationship
 * from AdminModule back into this module.
 */
@Module({
  imports: [PetAccessModule, NotificationsModule],
  controllers: [InsuranceController, PublicInsuranceController],
  providers: [PublicInsuranceReadService, EligibilityService, InsuranceApplicationService, InsuranceNotificationListener],
  exports: [PublicInsuranceReadService, EligibilityService, InsuranceApplicationService],
})
export class InsuranceModule {}
