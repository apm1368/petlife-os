import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../../households/households.module";
import { PetAccessModule } from "../../pet-access/pet-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { PromotionsModule } from "../promotions/promotions.module";

@Module({
  imports: [HouseholdsModule, PetAccessModule, CatalogModule, PromotionsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
