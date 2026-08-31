import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { NutritionController } from "./nutrition.controller";
import { NutritionService } from "./nutrition.service";

@Module({
  imports: [PetAccessModule],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}
