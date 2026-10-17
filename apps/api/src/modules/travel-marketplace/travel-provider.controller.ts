import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ProviderUserRole, TravelListingStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { RequireProviderRole } from "../provider-os/auth/require-provider-role.decorator";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { TravelListingService } from "./travel-listing.service";
import { TravelBookingService } from "./travel-booking.service";
import {
  CalendarQueryDto,
  CreateTravelInventoryUnitDto,
  CreateTravelListingDto,
  FinanceQueryDto,
  ProviderNoteDto,
  ProviderReasonDto,
  RatePlanInputDto,
  ReviewResponseDto,
  SearchTravelListingsQueryDto,
  SetTravelAvailabilityDto,
  TravelBookingListQueryDto,
  TravelMediaInputDto,
  UpdateTravelInventoryUnitDto,
  UpdateTravelListingDto,
  UpsertTravelPetPolicyDto,
} from "./dto/travel-marketplace.dto";

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page?: number;
}

/**
 * Travel partner operations. Scoped to the caller's active provider
 * organization (ProviderAuthGuard); another organization's listing or
 * booking is always "not found". Listing, unit, rate and inventory changes
 * need the OWNER role; day-to-day booking handling is open to the team.
 */
@Controller("provider/travel")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class TravelProviderController {
  constructor(
    private readonly listings: TravelListingService,
    private readonly bookings: TravelBookingService,
  ) {}

  @Get("listings")
  list(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: SearchTravelListingsQueryDto) {
    return this.listings.listForOrganization(ctx.organizationId, query);
  }

  @Get("listings/:id")
  get(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.listings.getForOrganization(id, ctx.organizationId);
  }

  @Post("listings")
  @RequireProviderRole(ProviderUserRole.OWNER)
  create(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateTravelListingDto) {
    return this.listings.create(ctx.organizationId, dto);
  }

  @Patch("listings/:id")
  @RequireProviderRole(ProviderUserRole.OWNER)
  update(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTravelListingDto) {
    return this.listings.update(id, ctx.organizationId, dto);
  }

  @Post("listings/:id/submit")
  @RequireProviderRole(ProviderUserRole.OWNER)
  submit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.listings.transition(id, ctx.organizationId, TravelListingStatus.PENDING_REVIEW);
  }

  @Post("listings/:id/withdraw")
  @RequireProviderRole(ProviderUserRole.OWNER)
  withdraw(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.listings.transition(id, ctx.organizationId, TravelListingStatus.DRAFT);
  }

  @Post("listings/:id/archive")
  @RequireProviderRole(ProviderUserRole.OWNER)
  archive(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.listings.transition(id, ctx.organizationId, TravelListingStatus.ARCHIVED);
  }

  @Put("listings/:id/pet-policy")
  @RequireProviderRole(ProviderUserRole.OWNER)
  petPolicy(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpsertTravelPetPolicyDto) {
    return this.listings.upsertPetPolicy(id, ctx.organizationId, dto);
  }

  @Post("listings/:id/media")
  @RequireProviderRole(ProviderUserRole.OWNER)
  addMedia(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TravelMediaInputDto) {
    return this.listings.addMedia(id, ctx.organizationId, dto);
  }

  @Delete("listings/:id/media/:mediaId")
  @HttpCode(200)
  @RequireProviderRole(ProviderUserRole.OWNER)
  removeMedia(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Param("mediaId", ParseUUIDPipe) mediaId: string) {
    return this.listings.removeMedia(id, mediaId, ctx.organizationId);
  }

  @Post("listings/:id/units")
  @RequireProviderRole(ProviderUserRole.OWNER)
  createUnit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateTravelInventoryUnitDto) {
    return this.listings.createUnit(id, ctx.organizationId, dto);
  }

  @Patch("listings/:id/units/:unitId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateUnit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Param("unitId", ParseUUIDPipe) unitId: string, @Body() dto: UpdateTravelInventoryUnitDto) {
    return this.listings.updateUnit(id, unitId, ctx.organizationId, dto);
  }

  @Post("listings/:id/units/:unitId/rate-plans")
  @RequireProviderRole(ProviderUserRole.OWNER)
  createRatePlan(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Param("unitId", ParseUUIDPipe) unitId: string, @Body() dto: RatePlanInputDto) {
    return this.listings.createRatePlan(id, unitId, ctx.organizationId, dto);
  }

  @Patch("listings/:id/units/:unitId/rate-plans/:ratePlanId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateRatePlan(
    @CurrentProviderContext() ctx: ResolvedProviderContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("unitId", ParseUUIDPipe) unitId: string,
    @Param("ratePlanId", ParseUUIDPipe) ratePlanId: string,
    @Body() dto: RatePlanInputDto,
  ) {
    return this.listings.updateRatePlan(id, unitId, ratePlanId, ctx.organizationId, dto);
  }

  /** Blocks/unblocks or reprices a date range for one unit (blackout). */
  @Put("listings/:id/units/:unitId/availability")
  @RequireProviderRole(ProviderUserRole.OWNER)
  async availability(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Param("unitId", ParseUUIDPipe) unitId: string, @Body() dto: SetTravelAvailabilityDto) {
    return { updatedDays: await this.listings.setAvailability(id, unitId, ctx.organizationId, dto) };
  }

  @Get("listings/:id/calendar")
  calendar(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Query() query: CalendarQueryDto) {
    return this.listings.calendar(id, ctx.organizationId, query.from, query.to);
  }

  @Get("bookings")
  bookingsList(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: TravelBookingListQueryDto) {
    return this.bookings.listForOrganization(ctx.organizationId, query);
  }

  @Get("bookings/:id")
  async bookingDetail(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.toDto(await this.bookings.loadForOrganization(ctx.organizationId, id));
  }

  @Post("bookings/:id/accept")
  accept(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ProviderNoteDto) {
    return this.bookings.accept(ctx.organizationId, ctx.userId, id, dto.note);
  }

  @Post("bookings/:id/reject")
  reject(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ProviderReasonDto) {
    return this.bookings.reject(ctx.organizationId, ctx.userId, id, dto.reason);
  }

  @Post("bookings/:id/check-in")
  checkIn(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.checkIn(ctx.organizationId, ctx.userId, id);
  }

  @Post("bookings/:id/complete")
  complete(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.complete(ctx.organizationId, ctx.userId, id);
  }

  @Post("bookings/:id/no-show")
  @RequireProviderRole(ProviderUserRole.OWNER)
  noShow(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ProviderNoteDto) {
    return this.bookings.noShow(ctx.organizationId, ctx.userId, id, dto.note);
  }

  @Post("bookings/:id/cancel")
  @RequireProviderRole(ProviderUserRole.OWNER)
  cancel(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ProviderReasonDto) {
    return this.bookings.cancelAsProvider(ctx.organizationId, ctx.userId, id, dto.reason);
  }

  @Get("bookings/:id/documents/:shareId/url")
  documentUrl(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Param("shareId", ParseUUIDPipe) shareId: string) {
    return this.bookings.providerDocumentUrl(ctx.organizationId, id, shareId);
  }

  @Get("reviews")
  reviews(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: PageDto) {
    return this.listings.listReviews(ctx.organizationId, query.page ?? 1);
  }

  @Post("reviews/:reviewId/response")
  respond(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("reviewId", ParseUUIDPipe) reviewId: string, @Body() dto: ReviewResponseDto) {
    return this.listings.respondToReview(ctx.organizationId, reviewId, dto.response);
  }

  @Get("finance")
  finance(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: FinanceQueryDto) {
    return this.listings.finance(ctx.organizationId, query.from, query.to);
  }
}
