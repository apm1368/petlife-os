import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { SessionUser } from "../../common/session/session.service";
import {
  AttachTravelBookingToTripDto,
  CancelTravelBookingDto,
  CreateTravelBookingDto,
  ListTravelBookingsQueryDto,
} from "./dto/travel-marketplace.dto";
import { TravelBookingService } from "./travel-booking.service";

/**
 * Pet-scoped booking commands. The initial consumer route intentionally
 * books the pet in the URL only; adding extra household pets requires their
 * own grant checks and is not silently inferred from household membership.
 */
@Controller("pets/:petId/travel-bookings")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class ConsumerTravelBookingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: TravelBookingService,
  ) {}

  @Get()
  @RequirePetAccess("canViewIdentity")
  async list(@Param("petId") petId: string, @Query() query: ListTravelBookingsQueryDto) {
    return this.bookings.listForPet(await this.householdId(petId), petId, query);
  }

  @Get(":bookingId")
  @RequirePetAccess("canViewIdentity")
  async get(@Param("petId") petId: string, @Param("bookingId") bookingId: string) {
    return this.bookings.getForPet(bookingId, await this.householdId(petId), petId);
  }

  @Post("listings/:listingId")
  @RequirePetAccess("canEditIdentity")
  async create(
    @Param("petId") petId: string,
    @Param("listingId") listingId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateTravelBookingDto,
  ) {
    const { petIds: _ignoredPetIds, ...input } = dto;
    return this.bookings.create(await this.householdId(petId), user.id, listingId, { ...input, petIds: [petId] });
  }

  @Post(":bookingId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  async cancel(@Param("petId") petId: string, @Param("bookingId") bookingId: string, @Body() dto: CancelTravelBookingDto) {
    const householdId = await this.householdId(petId);
    await this.bookings.getForPet(bookingId, householdId, petId);
    return this.bookings.cancelAsTraveler(bookingId, householdId, dto.reason);
  }

  @Post(":bookingId/trip")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  async attachToTrip(@Param("petId") petId: string, @Param("bookingId") bookingId: string, @Body() dto: AttachTravelBookingToTripDto) {
    const householdId = await this.householdId(petId);
    await this.bookings.getForPet(bookingId, householdId, petId);
    return this.bookings.attachToTrip(bookingId, householdId, dto.tripId);
  }

  private async householdId(petId: string): Promise<string> {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    return pet.householdId;
  }
}
