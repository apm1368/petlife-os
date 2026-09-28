import { Module } from "@nestjs/common";
import { InventoryModule } from "../commerce/inventory/inventory.module";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";
import { SellerFinanceController, SellerSettlementReadController } from "../seller-finance/seller-finance.controller";
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
import { SellerOrderController, SellerDashboardController } from "./seller-order.controller";
import { SellerOrderService } from "./seller-order.service";
import { SellerDashboardService } from "./seller-dashboard.service";
import { SellerPromotionController } from "./seller-promotion.controller";
import { PromotionsModule } from "../commerce/promotions/promotions.module";
import { OrdersModule } from "../commerce/orders/orders.module";

@Module({
  imports: [InventoryModule, SellerFinanceModule, PromotionsModule, OrdersModule],
  controllers: [
    SellerContextController,
    SellerContextPreferenceController,
    SellerOrganizationController,
    SellerTeamController,
    SellerOfferController,
    SellerInventoryController,
    SellerOrderController,
    SellerDashboardController,
    SellerFinanceController,
    SellerSettlementReadController,
    SellerPromotionController,
  ],
  providers: [SellerAccessService, SellerAuthGuard, SellerOrganizationService, SellerTeamService, SellerOfferService, SellerInventoryService, SellerOrderService, SellerDashboardService],
  exports: [SellerAccessService, SellerAuthGuard],
})
export class SellerOsModule {}
