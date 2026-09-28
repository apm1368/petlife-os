import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { TravelSearchService } from "./travel-search.service";
import { TravelAvailabilityService, publicQuote } from "./travel-availability.service";
import { TravelBookingService } from "./travel-booking.service";
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
  ) {}

  @Get("destinations")
  destinations() {
    return this.search.destinations();
  }

  @Get("listings")
  list(@Query() query: TravelSearchQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.search.search(user?.id, query);
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
    await this.search.detail(undefined, id);
    return this.availability.getUnitCalendar(unitId, query.from, query.to);
  }

  @Get("listings/:id/quote")
  async quote(@Param("id", ParseUUIDPipe) id: string, @Query() query: TravelQuoteV2QueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    await this.search.detail(undefined, id);
    const pets = await this.bookings.petFactsFor(user?.id, query.petIds ?? []);
    return publicQuote(await this.availability.quote(id, query.unitId, query.checkIn, query.checkOut, pets, query.ratePlanId ?? null));
  }
}
