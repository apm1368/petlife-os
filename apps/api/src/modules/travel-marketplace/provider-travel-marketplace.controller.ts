import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ProviderUserRole, TravelBookingStatus, TravelListingStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { RequireProviderRole } from "../provider-os/auth/require-provider-role.decorator";
import {
  CreateTravelInventoryUnitDto,
  CreateTravelListingDto,
  ListTravelBookingsQueryDto,
  RespondToTravelBookingDto,
  SearchTravelListingsQueryDto,
  SetTravelAvailabilityDto,
  UpdateTravelInventoryUnitDto,
  UpdateTravelListingDto,
  UpsertTravelPetPolicyDto,
} from "./dto/travel-marketplace.dto";
import { TravelBookingService } from "./travel-booking.service";
import { TravelListingService } from "./travel-listing.service";

/** Provider operations reuse the active ProviderOrganization context. */
@Controller("provider/travel")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderTravelMarketplaceController {
  constructor(
    private readonly listings: TravelListingService,
    private readonly bookings: TravelBookingService,
  ) {}

  @Get("listings")
  list(@CurrentProviderContext() provider: ResolvedProviderContext, @Query() query: SearchTravelListingsQueryDto) {
    return this.listings.listForOrganization(provider.organizationId, query);
  }

  @Get("listings/:listingId")
  get(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("listingId") listingId: string) {
    return this.listings.getForOrganization(listingId, provider.organizationId);
  }

  @Post("listings")
  @RequireProviderRole(ProviderUserRole.OWNER)
  create(@CurrentProviderContext() provider: ResolvedProviderContext, @Body() dto: CreateTravelListingDto) {
    return this.listings.create(provider.organizationId, dto);
  }

  @Patch("listings/:listingId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  update(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("listingId") listingId: string, @Body() dto: UpdateTravelListingDto) {
    return this.listings.update(listingId, provider.organizationId, dto);
  }

  @Post("listings/:listingId/submit")
  @HttpCode(HttpStatus.OK)
  @RequireProviderRole(ProviderUserRole.OWNER)
  submit(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("listingId") listingId: string) {
    return this.listings.transition(listingId, provider.organizationId, TravelListingStatus.PENDING_REVIEW);
  }

  @Post("listings/:listingId/pet-policy")
  @HttpCode(HttpStatus.OK)
  @RequireProviderRole(ProviderUserRole.OWNER)
  upsertPetPolicy(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("listingId") listingId: string, @Body() dto: UpsertTravelPetPolicyDto) {
    return this.listings.upsertPetPolicy(listingId, provider.organizationId, dto);
  }

  @Post("listings/:listingId/units")
  @RequireProviderRole(ProviderUserRole.OWNER)
  createUnit(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("listingId") listingId: string, @Body() dto: CreateTravelInventoryUnitDto) {
    return this.listings.createUnit(listingId, provider.organizationId, dto);
  }

  @Patch("listings/:listingId/units/:unitId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateUnit(
    @CurrentProviderContext() provider: ResolvedProviderContext,
    @Param("listingId") listingId: string,
    @Param("unitId") unitId: string,
    @Body() dto: UpdateTravelInventoryUnitDto,
  ) {
    return this.listings.updateUnit(listingId, unitId, provider.organizationId, dto);
  }

  @Post("listings/:listingId/units/:unitId/availability")
  @HttpCode(HttpStatus.OK)
  @RequireProviderRole(ProviderUserRole.OWNER)
  setAvailability(
    @CurrentProviderContext() provider: ResolvedProviderContext,
    @Param("listingId") listingId: string,
    @Param("unitId") unitId: string,
    @Body() dto: SetTravelAvailabilityDto,
  ) {
    return this.listings.setAvailability(listingId, unitId, provider.organizationId, dto);
  }

  @Get("bookings")
  listBookings(@CurrentProviderContext() provider: ResolvedProviderContext, @Query() query: ListTravelBookingsQueryDto) {
    return this.bookings.listForOrganization(provider.organizationId, query);
  }

  @Post("bookings/:bookingId/confirm")
  @HttpCode(HttpStatus.OK)
  @RequireProviderRole(ProviderUserRole.OWNER)
  confirm(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("bookingId") bookingId: string, @Body() dto: RespondToTravelBookingDto) {
    return this.bookings.respondAsProvider(bookingId, provider.organizationId, TravelBookingStatus.CONFIRMED, dto.providerNote);
  }

  @Post("bookings/:bookingId/reject")
  @HttpCode(HttpStatus.OK)
  @RequireProviderRole(ProviderUserRole.OWNER)
  reject(@CurrentProviderContext() provider: ResolvedProviderContext, @Param("bookingId") bookingId: string, @Body() dto: RespondToTravelBookingDto) {
    return this.bookings.respondAsProvider(bookingId, provider.organizationId, TravelBookingStatus.REJECTED, dto.providerNote);
  }
}
