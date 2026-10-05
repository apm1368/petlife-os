import { NotificationsModule } from "../notifications/notifications.module";
import { TripReminderNotifier } from "./trip-reminder.notifier";
import { TripExtrasController } from "./trip-extras.controller";
import { TripExtrasService } from "./trip-extras.service";
import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { TripService } from "./trip.service";
import { TravelRequirementService } from "./travel-requirement.service";
import { PetPassportReadinessService } from "./pet-passport-readiness.service";
import { TravelController } from "./travel.controller";

@Module({
  imports: [PetAccessModule, NotificationsModule],
  controllers: [TravelController, TripExtrasController],
  providers: [TripReminderNotifier, TripExtrasService, TripService, TravelRequirementService, PetPassportReadinessService],
  exports: [TripService, TravelRequirementService, PetPassportReadinessService],
})
export class TravelModule {}
