import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { TRAVEL_SOURCE_ADAPTERS, buildAdapterRegistry } from "./adapters/adapter-registry";
import { TravelExternalService } from "./travel-external.service";
import { TravelExternalPublicService } from "./travel-external-public.service";
import { TravelExternalAdminService } from "./travel-external-admin.service";
import { TravelExternalWorker } from "./travel-external.worker";
import { AdminTravelExternalController, ExternalStayFavoritesController, TravelExternalPublicController, TripExternalStaysController } from "./travel-external.controllers";

/** TRAVEL-EXT: source-attributed pet-friendly external stays (discovery layer only — bookings happen on the source). */
@Module({
  imports: [AdminModule, PetAccessModule],
  controllers: [TravelExternalPublicController, ExternalStayFavoritesController, TripExternalStaysController, AdminTravelExternalController],
  providers: [{ provide: TRAVEL_SOURCE_ADAPTERS, useFactory: buildAdapterRegistry }, TravelExternalService, TravelExternalPublicService, TravelExternalAdminService, TravelExternalWorker],
  exports: [TravelExternalService],
})
export class TravelExternalModule {}
