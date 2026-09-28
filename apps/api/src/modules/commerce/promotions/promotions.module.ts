import { Module } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { PromotionManagementService } from "./promotion-management.service";

@Module({
  providers: [PricingService, PromotionManagementService],
  exports: [PricingService, PromotionManagementService],
})
export class PromotionsModule {}
