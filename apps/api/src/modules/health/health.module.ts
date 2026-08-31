import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { HealthController } from "./health.controller";
import { HealthProfileService } from "./health-profile.service";
import { HealthSummaryService } from "./health-summary.service";
import { AllergiesController } from "./allergies.controller";
import { AllergiesService } from "./allergies.service";
import { ConditionsController } from "./conditions.controller";
import { ConditionsService } from "./conditions.service";
import { MedicationsController } from "./medications.controller";
import { MedicationsService } from "./medications.service";
import { VaccinationController } from "./vaccination.controller";
import { VaccinationService } from "./vaccination.service";

/**
 * Named PetHealthModule (not HealthModule) to avoid colliding with the
 * unrelated infrastructure health-check module at src/health/health.module.ts
 * (`GET /health/live`, `/health/ready`) — same word, different domain.
 */
@Module({
  imports: [PetAccessModule],
  controllers: [HealthController, AllergiesController, ConditionsController, MedicationsController, VaccinationController],
  providers: [
    HealthProfileService,
    HealthSummaryService,
    AllergiesService,
    ConditionsService,
    MedicationsService,
    VaccinationService,
  ],
  exports: [HealthProfileService, HealthSummaryService],
})
export class PetHealthModule {}
