import { Module } from "@nestjs/common";
import { MapsModule } from "../maps/maps.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { AdminModule } from "../admin/admin.module";
import { AdminPetTaxiController } from "./admin-pet-taxi.controller";
import { PetTaxiController, ProviderPetTaxiController } from "./pet-taxi.controller";
import { PetTaxiService } from "./pet-taxi.service";

@Module({
  imports: [MapsModule, ProviderOsModule, AdminModule],
  controllers: [PetTaxiController, ProviderPetTaxiController, AdminPetTaxiController],
  providers: [PetTaxiService],
  exports: [PetTaxiService],
})
export class PetTaxiModule {}
