import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { AdminClinicSubscriptionController, ClinicOsController, MyClinicInvitationsController, MyClinicNotesController } from "./clinic-os.controller";
import { ClinicOperationsService } from "./clinic-operations.service";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import { ClinicSubscriptionService } from "./clinic-subscription.service";
import { ClinicCustomersService } from "./clinic-customers.service";
import { ClinicRemindersService } from "./clinic-reminders.service";
import { ClinicFinanceService } from "./clinic-finance.service";
import { ClinicTeamService } from "./clinic-team.service";

/** Clinic OS — the B2B layer over Provider OS + vet panel. See docs/product/clinic-os-architecture.md. */
@Module({
  imports: [AdminModule, NotificationsModule, ProviderOsModule],
  controllers: [ClinicOsController, AdminClinicSubscriptionController, MyClinicInvitationsController, MyClinicNotesController],
  providers: [ClinicEntitlementService, ClinicSubscriptionService, ClinicCustomersService, ClinicRemindersService, ClinicFinanceService, ClinicTeamService, ClinicOperationsService],
  exports: [ClinicEntitlementService],
})
export class ClinicOsModule {}
