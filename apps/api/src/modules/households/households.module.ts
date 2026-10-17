import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { HouseholdInvitationsController, HouseholdsController } from "./households.controller";
import { SubscriptionsModule } from "../subscriptions/subscription.module";
import { HouseholdsService } from "./households.service";

@Module({
  controllers: [HouseholdsController, HouseholdInvitationsController],
  imports: [NotificationsModule, SubscriptionsModule],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
