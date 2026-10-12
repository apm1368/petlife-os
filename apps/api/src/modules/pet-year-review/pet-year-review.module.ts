import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PetYearReviewController } from "./pet-year-review.controller";
import { PetYearReviewService } from "./pet-year-review.service";

@Module({
  imports: [PetAccessModule],
  controllers: [PetYearReviewController],
  providers: [PetYearReviewService],
})
export class PetYearReviewModule {}
