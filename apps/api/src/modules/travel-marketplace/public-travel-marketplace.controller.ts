import { Controller, Get, Param, Query } from "@nestjs/common";
import { TravelInventoryUnitNotFoundException } from "../../common/errors/api-exception";
import { TravelAvailabilityService } from "./travel-availability.service";
import { TravelListingService } from "./travel-listing.service";
import { SearchTravelListingsQueryDto, TravelAvailabilityQueryDto, TravelQuoteQueryDto } from "./dto/travel-marketplace.dto";

/** Anonymous, read-only discovery surface for published travel supply. */
@Controller("travel")
export class PublicTravelMarketplaceController {
  constructor(
    private readonly listings: TravelListingService,
    private readonly availability: TravelAvailabilityService,
  ) {}

  @Get("listings/cities")
  listCities() {
    return this.listings.listCities();
  }

  @Get("listings")
  search(@Query() query: SearchTravelListingsQueryDto) {
    return this.listings.search(query);
  }

  @Get("listings/:listingId")
  get(@Param("listingId") listingId: string) {
    return this.listings.getPublic(listingId);
  }

  @Get("listings/:listingId/units/:unitId/availability")
  async availabilityForUnit(
    @Param("listingId") listingId: string,
    @Param("unitId") unitId: string,
    @Query() query: TravelAvailabilityQueryDto,
  ) {
    const listing = await this.listings.getPublic(listingId);
    if (!listing.units.some((unit) => unit.id === unitId)) throw new TravelInventoryUnitNotFoundException({ listingId, unitId });
    return this.availability.getUnitCalendar(unitId, query.fromDate, query.toDate);
  }

  @Get("listings/:listingId/quote")
  async quote(@Param("listingId") listingId: string, @Query() query: TravelQuoteQueryDto) {
    const listing = await this.listings.getPublic(listingId);
    if (!listing.units.some((unit) => unit.id === query.unitId)) throw new TravelInventoryUnitNotFoundException({ listingId, unitId: query.unitId });
    return this.availability.quote(listingId, query.unitId, query.checkIn, query.checkOut, query.petCount ?? 0);
  }
}
