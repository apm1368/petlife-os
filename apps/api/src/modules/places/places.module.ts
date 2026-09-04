import { Module } from "@nestjs/common";
import { PublicPlacesReadService } from "./public-places-read.service";
import { PetFriendlyPlaceFavoriteService } from "./pet-friendly-place-favorite.service";
import { PlacesController } from "./places.controller";
import { PublicPlacesController } from "./public-places.controller";

/**
 * The public/consumer half of the Handoff 19 Pet-Friendly Places domain —
 * read-only directory/nearby-geo-search plus a household's own favorites.
 * The admin-mutating half (PetFriendlyPlaceService — create/update/verify/
 * list) lives directly in AdminModule (`admin/places/`) since it needs
 * AdminAuditLogService — the exact layering AnimalSupportModule/
 * InsuranceModule already established. There is no import relationship
 * from AdminModule back into this module.
 */
@Module({
  // PlacesController ("/places/favorites/*") is registered before
  // PublicPlacesController ("/places/:placeId") deliberately — Nest/Express
  // binds routes in controller-declaration order, and a ":placeId" route
  // registered first would swallow "/places/favorites" requests (placeId
  // would just be "favorites"). Same "literal before wildcard" rule already
  // used within a single controller (see TravelController's own ordering).
  controllers: [PlacesController, PublicPlacesController],
  providers: [PublicPlacesReadService, PetFriendlyPlaceFavoriteService],
  exports: [PublicPlacesReadService, PetFriendlyPlaceFavoriteService],
})
export class PlacesModule {}
