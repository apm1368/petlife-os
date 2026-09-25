import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";
import { PetServiceCompatibilityService } from "./pet-service-compatibility.service";
import { PetAccessModule } from "../pet-access/pet-access.module";

@Module({
  imports: [ProvidersModule, PetAccessModule],
  controllers: [ServicesController],
  providers: [ServicesService, PetServiceCompatibilityService],
  exports: [PetServiceCompatibilityService],
})
export class ServicesModule {}
