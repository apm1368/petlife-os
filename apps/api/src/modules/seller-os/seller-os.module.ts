import { Module } from "@nestjs/common";
import { InventoryModule } from "../commerce/inventory/inventory.module";
import { SellerAccessService } from "./seller-access.service";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { SellerContextController, SellerContextPreferenceController } from "./seller-context.controller";
import { SellerOrganizationController } from "./seller-organization.controller";
import { SellerOrganizationService } from "./seller-organization.service";
import { SellerTeamController } from "./seller-team.controller";
import { SellerTeamService } from "./seller-team.service";
import { SellerOfferController } from "./seller-offer.controller";
import { SellerOfferService } from "./seller-offer.service";
import { SellerInventoryController } from "./seller-inventory.controller";
import { SellerInventoryService } from "./seller-inventory.service";

@Module({
  imports: [InventoryModule],
  controllers: [
    SellerContextController,
    SellerContextPreferenceController,
    SellerOrganizationController,
    SellerTeamController,
    SellerOfferController,
    SellerInventoryController,
  ],
  providers: [SellerAccessService, SellerAuthGuard, SellerOrganizationService, SellerTeamService, SellerOfferService, SellerInventoryService],
  exports: [SellerAccessService, SellerAuthGuard],
})
export class SellerOsModule {}
