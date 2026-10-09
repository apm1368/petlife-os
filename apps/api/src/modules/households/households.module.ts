import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { HouseholdInvitationsController, HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";

@Module({
  controllers: [HouseholdsController, HouseholdInvitationsController],
  imports: [NotificationsModule],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
