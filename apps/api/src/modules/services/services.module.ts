import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";
import { PetServiceCompatibilityService } from "./pet-service-compatibility.service";

@Module({
  imports: [ProvidersModule],
  controllers: [ServicesController],
  providers: [ServicesService, PetServiceCompatibilityService],
  exports: [PetServiceCompatibilityService],
})
export class ServicesModule {}
