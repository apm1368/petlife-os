import { Module } from "@nestjs/common";
import { PetAccessModule } from "../../pet-access/pet-access.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { ProductCompatibilityService } from "./product-compatibility.service";
import { PromotionsModule } from "../promotions/promotions.module";

@Module({
  imports: [PetAccessModule, PromotionsModule],
  controllers: [CatalogController],
  providers: [CatalogService, ProductCompatibilityService],
  exports: [ProductCompatibilityService, CatalogService],
})
export class CatalogModule {}
