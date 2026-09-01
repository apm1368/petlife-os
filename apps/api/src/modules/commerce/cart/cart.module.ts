import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../../households/households.module";
import { PetAccessModule } from "../../pet-access/pet-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [HouseholdsModule, PetAccessModule, CatalogModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
