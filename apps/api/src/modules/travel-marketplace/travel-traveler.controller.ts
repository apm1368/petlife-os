import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../common/session/session.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TravelBookingService } from "./travel-booking.service";
import { TravelTripHubService } from "./travel-trip-hub.service";
import { TravelSearchService } from "./travel-search.service";
import {
  AttachTravelBookingToTripDto,
  CancelTravelBookingDto,
  HoldTravelBookingDto,
  ModifyTravelBookingDto,
  PayTravelBookingDto,
  ShareTravelDocumentDto,
  SubmitTravelBookingDto,
  TravelBookingListQueryDto,
  TravelReviewInputDto,
} from "./dto/travel-marketplace.dto";

class RuleIdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsUUID("all", { each: true }) ruleIds!: string[];
}

class TripScopeDto {
  @IsOptional() @IsIn(["upcoming", "past"]) scope?: "upcoming" | "past";
}

/** Traveller-side travel: holds, bookings, payment, cancellation, changes, reviews, document sharing, favorites and trips. */
@Controller("travel")
@UseGuards(SessionAuthGuard)
export class TravelTravelerController {
  constructor(
    private readonly bookings: TravelBookingService,
    private readonly trips: TravelTripHubService,
    private readonly search: TravelSearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("bookings/hold")
  @UseInterceptors(IdempotencyInterceptor)
  hold(@CurrentUser() user: SessionUser, @Body() dto: HoldTravelBookingDto) {
    return this.bookings.hold(user.id, dto);
  }

  @Get("bookings")
  list(@CurrentUser() user: SessionUser, @Query() query: TravelBookingListQueryDto) {
    return this.bookings.listForUser(user.id, query);
  }

  @Get("bookings/:id")
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.getForUser(user.id, id);
  }

  @Post("bookings/:id/submit")
  submit(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SubmitTravelBookingDto) {
    return this.bookings.submit(user.id, id, dto);
  }

  @Post("bookings/:id/pay")
  @UseInterceptors(IdempotencyInterceptor)
  pay(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PayTravelBookingDto) {
    return this.bookings.pay(user.id, id, dto);
  }

  @Post("bookings/:id/cancel")
  @UseInterceptors(IdempotencyInterceptor)
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelTravelBookingDto) {
    return this.bookings.cancelAsTraveler(user.id, id, dto.reason);
  }

  @Post("bookings/:id/modify")
  @UseInterceptors(IdempotencyInterceptor)
  modify(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ModifyTravelBookingDto) {
    return this.bookings.modify(user.id, id, dto);
  }

  @Post("bookings/:id/review")
  review(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TravelReviewInputDto) {
    return this.bookings.review(user.id, id, dto);
  }

  @Post("bookings/:id/documents")
  share(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ShareTravelDocumentDto) {
    return this.bookings.shareDocument(user.id, id, dto);
  }

  @Delete("bookings/:id/documents/:shareId")
  @HttpCode(200)
  revoke(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Param("shareId", ParseUUIDPipe) shareId: string) {
    return this.bookings.revokeDocument(user.id, id, shareId);
  }

  @Post("bookings/:id/attach-trip")
  attach(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AttachTravelBookingToTripDto) {
    return this.bookings.attachToTrip(user.id, id, dto.tripId);
  }

  @Put("listings/:id/favorite")
  async favorite(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    const listing = await this.prisma.travelListing.findFirst({ where: { id, status: "PUBLISHED", isPubliclyListed: true }, select: { id: true } });
    if (!listing) throw new NotFoundApiException("Listing");
    await this.prisma.travelListingFavorite.upsert({ where: { userId_listingId: { userId: user.id, listingId: id } }, create: { userId: user.id, listingId: id }, update: {} });
    return { listingId: id, favorited: true };
  }

  @Delete("listings/:id/favorite")
  @HttpCode(200)
  async unfavorite(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.prisma.travelListingFavorite.deleteMany({ where: { userId: user.id, listingId: id } });
    return { listingId: id, favorited: false };
  }

  @Get("favorites")
  async favorites(@CurrentUser() user: SessionUser) {
    const favs = await this.prisma.travelListingFavorite.findMany({ where: { userId: user.id, listing: { status: "PUBLISHED", isPubliclyListed: true } }, orderBy: { createdAt: "desc" }, take: 60, select: { listingId: true } });
    if (favs.length === 0) return [];
    const compared = await this.search.compare(user.id, favs.map((f) => f.listingId).slice(0, 60));
    return compared;
  }

  @Get("trips")
  listTrips(@CurrentUser() user: SessionUser, @Query() query: TripScopeDto) {
    return this.trips.listTrips(user.id, query.scope);
  }

  @Get("trips/:id/hub")
  hub(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.trips.hub(user.id, id);
  }

  @Post("trips/:id/requirements/from-rules")
  fromRules(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RuleIdsDto) {
    return this.trips.addFromRules(user.id, id, dto.ruleIds);
  }
}
