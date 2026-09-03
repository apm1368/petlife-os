import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { SellerOsModule } from "../../seller-os/seller-os.module";
import { SellerFinanceModule } from "../../seller-finance/seller-finance.module";
import { DevMarketplaceAdapter } from "./dev-marketplace.adapter";
import { TorobAdapter } from "./torob.adapter";
import { DigikalaAdapter } from "./digikala.adapter";
import { MarketplaceChannelRegistry } from "./marketplace-channel-registry.service";
import { MarketplaceChannelAccountService } from "./marketplace-channel-account.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { MarketplaceOrderIngestionService } from "./marketplace-order-ingestion.service";
import { MarketplaceChannelController } from "./marketplace-channel.controller";
import { MarketplaceListingController } from "./marketplace-listing.controller";
import { MarketplaceDevController } from "./marketplace-dev.controller";

/**
 * Provider-neutral marketplace channel integration architecture (spec
 * section 11-36) — imports SellerOsModule for SellerAuthGuard/
 * SellerAccessService (every controller here is seller-scoped) and
 * InventoryModule for the shared InventoryMovementService (order
 * ingestion/cancellation decrement/restore onHand through it, same as
 * SellerInventoryService's manual adjustments).
 */
@Module({
  imports: [InventoryModule, SellerOsModule, SellerFinanceModule],
  controllers: [MarketplaceChannelController, MarketplaceListingController, MarketplaceDevController],
  providers: [DevMarketplaceAdapter, TorobAdapter, DigikalaAdapter, MarketplaceChannelRegistry, MarketplaceChannelAccountService, MarketplaceListingService, MarketplaceOrderIngestionService],
  exports: [MarketplaceChannelRegistry, MarketplaceOrderIngestionService, MarketplaceChannelAccountService, MarketplaceListingService],
})
export class MarketplaceModule {}
