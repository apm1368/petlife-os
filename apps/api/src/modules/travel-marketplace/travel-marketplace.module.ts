import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { ConsumerTravelBookingController } from "./consumer-travel-booking.controller";
import { ProviderTravelMarketplaceController } from "./provider-travel-marketplace.controller";
import { PublicTravelMarketplaceController } from "./public-travel-marketplace.controller";
import { TravelAvailabilityService } from "./travel-availability.service";
import { TravelBookingService } from "./travel-booking.service";
import { TravelListingService } from "./travel-listing.service";

/**
 * The marketplace domain already owned its data model and services. This
 * module is deliberately thin: it registers those existing services as the
 * canonical public, traveller, and provider HTTP surfaces without creating a
 * parallel travel model.
 */
@Module({
  imports: [PetAccessModule, ProviderOsModule],
  controllers: [PublicTravelMarketplaceController, ConsumerTravelBookingController, ProviderTravelMarketplaceController],
  providers: [TravelAvailabilityService, TravelListingService, TravelBookingService],
  exports: [TravelAvailabilityService, TravelListingService, TravelBookingService],
})
export class TravelMarketplaceModule {}
