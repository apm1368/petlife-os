import { Module } from "@nestjs/common";
import { PetAccessModule } from "../../pet-access/pet-access.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { ProductCompatibilityService } from "./product-compatibility.service";

@Module({
  imports: [PetAccessModule],
  controllers: [CatalogController],
  providers: [CatalogService, ProductCompatibilityService],
  exports: [ProductCompatibilityService],
})
export class CatalogModule {}
