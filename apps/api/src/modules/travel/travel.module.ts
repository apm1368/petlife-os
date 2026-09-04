import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { TripService } from "./trip.service";
import { TravelRequirementService } from "./travel-requirement.service";
import { PetPassportReadinessService } from "./pet-passport-readiness.service";
import { TravelController } from "./travel.controller";

@Module({
  imports: [PetAccessModule],
  controllers: [TravelController],
  providers: [TripService, TravelRequirementService, PetPassportReadinessService],
  exports: [TripService, TravelRequirementService, PetPassportReadinessService],
})
export class TravelModule {}
