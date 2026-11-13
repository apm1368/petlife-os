import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { TravelSearchService } from "./travel-search.service";
import { TravelAvailabilityService, publicQuote } from "./travel-availability.service";
import { TravelBookingService } from "./travel-booking.service";
import { TravelInventoryUnitNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { AddressesService } from "../addresses/addresses.service";
import { CalendarQueryDto, TravelCompareQueryDto, TravelQuoteV2QueryDto, TravelSearchQueryDto } from "./dto/travel-marketplace.dto";

class ReviewPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page?: number;
}

/**
 * Public travel discovery. Anonymous callers browse and price stays; a
 * signed-in caller may pass their own pet ids (never shown in results) for
 * a pet-policy match and pet fees.
 */
@Controller("travel")
@UseGuards(OptionalSessionAuthGuard)
export class TravelPublicController {
  constructor(
    private readonly search: TravelSearchService,
    private readonly availability: TravelAvailabilityService,
    private readonly bookings: TravelBookingService,
    private readonly addresses: AddressesService,
  ) {}

  @Get("destinations")
  destinations() {
    return this.search.destinations();
  }

  /**
   * A point never travels in a URL (access logs): the browser's point goes to POST /travel/listings/near; `near=home`
   * uses the member's own pinned default address, read here and never echoed.
   */
  @Get("listings")
  async list(@Query() query: TravelSearchQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (query.lat !== undefined || query.lng !== undefined) throw new ValidationApiException({ field: "lat", reason: "POINT_IN_QUERY" });
    if (query.near !== "home") return this.search.search(user?.id, query);
    const home = user ? await this.addresses.homePoint(user.id) : null;
    if (!home) throw new ValidationApiException({ field: "near", reason: "HOME_PIN_MISSING" });
    return this.search.search(user?.id, { ...query, near: undefined, lat: home.latitude, lng: home.longitude });
  }

  /** Same search, from the browser's point sent in the body for this one request (never stored, never in a URL or log). */
  @Post("listings/near")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listNear(@Body() body: TravelSearchQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (body.lat === undefined || body.lng === undefined) throw new ValidationApiException({ field: "lat", reason: "POINT_REQUIRED" });
    return this.search.search(user?.id, { ...body, near: undefined });
  }

  @Get("compare")
  compare(@Query() query: TravelCompareQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.search.compare(user?.id, query.ids, query.checkIn, query.checkOut);
  }

  @Get("listings/:id")
  detail(@Param("id", ParseUUIDPipe) id: string, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.search.detail(user?.id, id);
  }

  @Get("listings/:id/reviews")
  reviews(@Param("id", ParseUUIDPipe) id: string, @Query() query: ReviewPageDto) {
    return this.bookings.listPublishedReviews(id, query.page ?? 1, 10);
  }

  @Get("listings/:id/units/:unitId/calendar")
  async calendar(@Param("id", ParseUUIDPipe) id: string, @Param("unitId", ParseUUIDPipe) unitId: string, @Query() query: CalendarQueryDto) {
    const listing = await this.search.detail(undefined, id);
    // Only units of this published listing — never another (unpublished) listing's calendar.
    if (!listing.units.some((u) => u.id === unitId && u.isActive)) throw new TravelInventoryUnitNotFoundException({ unitId });
    return this.availability.getUnitCalendar(unitId, query.from, query.to);
  }

  @Get("listings/:id/quote")
  async quote(@Param("id", ParseUUIDPipe) id: string, @Query() query: TravelQuoteV2QueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    await this.search.detail(undefined, id);
    const pets = await this.bookings.petFactsFor(user?.id, query.petIds ?? []);
    return publicQuote(await this.availability.quote(id, query.unitId, query.checkIn, query.checkOut, pets, query.ratePlanId ?? null));
  }
}
