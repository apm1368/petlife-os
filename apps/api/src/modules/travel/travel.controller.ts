import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { TripService } from "./trip.service";
import { TravelRequirementService } from "./travel-requirement.service";
import { PetPassportReadinessService } from "./pet-passport-readiness.service";
import { CreateTravelRequirementDto, CreateTripDto, TransitionTripDto, UpdateTravelRequirementDto, UpdateTripDto } from "./dto/travel.dto";

/**
 * Household-authenticated Travel surface. Reuses canViewIdentity/
 * canEditIdentity the same way Lost Pet does — a trip is identity/logistics
 * data about the pet, not clinical data (linked documents stay behind H17's
 * own access flow; this module only ever stores a reference id to them).
 */
@Controller("pets/:petId/trips")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class TravelController {
  constructor(
    private readonly trips: TripService,
    private readonly requirements: TravelRequirementService,
    private readonly passportReadiness: PetPassportReadinessService,
  ) {}

  @Post()
  @RequirePetAccess("canEditIdentity")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateTripDto) {
    return this.trips.create(petId, user.id, dto);
  }

  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId") petId: string) {
    return this.trips.list(petId);
  }

  @Get("passport-readiness")
  @RequirePetAccess("canViewIdentity")
  getPassportReadiness(@Param("petId") petId: string) {
    return this.passportReadiness.getReadiness(petId);
  }

  @Get(":tripId")
  @RequirePetAccess("canViewIdentity")
  get(@Param("petId") petId: string, @Param("tripId") tripId: string) {
    return this.trips.get(petId, tripId);
  }

  @Patch(":tripId")
  @RequirePetAccess("canEditIdentity")
  update(@Param("petId") petId: string, @Param("tripId") tripId: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(petId, tripId, dto);
  }

  @Post(":tripId/transition")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  transition(@Param("petId") petId: string, @Param("tripId") tripId: string, @Body() dto: TransitionTripDto) {
    return this.trips.transition(petId, tripId, dto);
  }

  @Get(":tripId/requirements")
  @RequirePetAccess("canViewIdentity")
  listRequirements(@Param("petId") petId: string, @Param("tripId") tripId: string) {
    return this.requirements.list(petId, tripId);
  }

  @Get(":tripId/requirement-suggestions")
  @RequirePetAccess("canViewIdentity")
  getRequirementSuggestions(@Param("petId") petId: string, @Param("tripId") tripId: string) {
    return this.requirements.getSuggestedRequirementTypes(petId, tripId);
  }

  @Get(":tripId/readiness")
  @RequirePetAccess("canViewIdentity")
  getReadiness(@Param("petId") petId: string, @Param("tripId") tripId: string) {
    return this.requirements.getReadinessSummary(petId, tripId);
  }

  @Post(":tripId/requirements")
  @RequirePetAccess("canEditIdentity")
  createRequirement(@Param("petId") petId: string, @Param("tripId") tripId: string, @Body() dto: CreateTravelRequirementDto) {
    return this.requirements.create(petId, tripId, dto);
  }

  @Patch(":tripId/requirements/:requirementId")
  @RequirePetAccess("canEditIdentity")
  updateRequirement(
    @Param("petId") petId: string,
    @Param("tripId") tripId: string,
    @Param("requirementId") requirementId: string,
    @Body() dto: UpdateTravelRequirementDto,
  ) {
    return this.requirements.update(petId, tripId, requirementId, dto);
  }

  @Delete(":tripId/requirements/:requirementId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePetAccess("canEditIdentity")
  deleteRequirement(@Param("petId") petId: string, @Param("tripId") tripId: string, @Param("requirementId") requirementId: string) {
    return this.requirements.delete(petId, tripId, requirementId);
  }
}
