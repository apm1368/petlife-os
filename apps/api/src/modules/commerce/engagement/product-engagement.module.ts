import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { ProductEngagementController } from "./product-engagement.controller";
import { ProductEngagementService } from "./product-engagement.service";

@Module({
  imports: [CatalogModule],
  controllers: [ProductEngagementController],
  providers: [ProductEngagementService],
  exports: [ProductEngagementService],
})
export class ProductEngagementModule {}
