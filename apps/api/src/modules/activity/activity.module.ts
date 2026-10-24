import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { HouseholdActivityController } from "./household-activity.controller";
import { HouseholdActivityService } from "./household-activity.service";

/** Household activity feed — a privacy-filtered read model over the domain event log. */
@Module({
  imports: [PetAccessModule],
  controllers: [HouseholdActivityController],
  providers: [HouseholdActivityService],
})
export class ActivityModule {}
