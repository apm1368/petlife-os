import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { NutritionService } from "./nutrition.service";
import { UpdateNutritionDto } from "./dto/update-nutrition.dto";

/**
 * Nutrition is gated by the same Health permissions as the rest of Health
 * Basics — the spec groups "Diet" as one of the Health Basics onboarding
 * questions, and there is no separate canViewNutrition/canEditNutrition
 * flag in the PetAccess model, so canViewHealth/canEditHealth is the
 * correct existing gate rather than inventing a new permission.
 */
@Controller("pets/:petId/nutrition")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  get(@Param("petId") petId: string) {
    return this.nutritionService.get(petId);
  }

  @Put()
  @RequirePetAccess("canEditHealth")
  upsert(@Param("petId") petId: string, @Body() dto: UpdateNutritionDto) {
    return this.nutritionService.upsert(petId, dto);
  }
}
