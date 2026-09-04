import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { LostPetIncidentService } from "./lost-pet-incident.service";
import { CloseLostPetIncidentDto, CreateLostPetIncidentDto, RequestLostPetPhotoUploadDto, ReviewLostPetSightingDto } from "./dto/lost-pet.dto";

/**
 * Household-authenticated Lost Pet surface. Authorization reuses
 * canViewIdentity/canEditIdentity (spec never asks for a new access-flag
 * granularity for Lost Pet, and "who this pet's core identity/whereabouts
 * status belongs to" is exactly what those two flags already mean) rather
 * than a health/care flag, which would be semantically wrong here.
 */
@Controller("pets/:petId/lost-incidents")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class LostPetController {
  constructor(private readonly incidents: LostPetIncidentService) {}

  @Post()
  @RequirePetAccess("canEditIdentity")
  open(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateLostPetIncidentDto) {
    return this.incidents.open(petId, user.id, dto);
  }

  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId") petId: string) {
    return this.incidents.list(petId);
  }

  @Get(":incidentId")
  @RequirePetAccess("canViewIdentity")
  get(@Param("petId") petId: string, @Param("incidentId") incidentId: string) {
    return this.incidents.get(petId, incidentId);
  }

  @Post("upload-url")
  @RequirePetAccess("canEditIdentity")
  requestPhotoUpload(@Param("petId") petId: string, @Body() dto: RequestLostPetPhotoUploadDto) {
    // Two-phase upload (request URL -> PUT -> confirm): the incident doesn't exist yet, so the target is keyed by
    // petId; the confirmed key is passed back verbatim as CreateLostPetIncidentDto.primaryPhotoObjectKey.
    return this.incidents.requestPhotoUpload(petId, dto.contentType, dto.fileSizeBytes);
  }

  @Post(":incidentId/mark-searching")
  @RequirePetAccess("canEditIdentity")
  markSearching(@Param("petId") petId: string, @Param("incidentId") incidentId: string) {
    return this.incidents.markSearching(petId, incidentId);
  }

  @Post(":incidentId/share-to-community")
  @RequirePetAccess("canEditIdentity")
  shareToCommunity(@Param("petId") petId: string, @Param("incidentId") incidentId: string, @CurrentUser() user: SessionUser) {
    return this.incidents.shareToCommunity(petId, incidentId, user.id);
  }

  @Post(":incidentId/mark-found")
  @RequirePetAccess("canEditIdentity")
  markFound(@Param("petId") petId: string, @Param("incidentId") incidentId: string) {
    return this.incidents.markFound(petId, incidentId);
  }

  @Post(":incidentId/reunite")
  @RequirePetAccess("canEditIdentity")
  reunite(@Param("petId") petId: string, @Param("incidentId") incidentId: string, @CurrentUser() user: SessionUser) {
    return this.incidents.reunite(petId, incidentId, user.id);
  }

  @Post(":incidentId/close")
  @RequirePetAccess("canEditIdentity")
  close(@Param("petId") petId: string, @Param("incidentId") incidentId: string, @Body() dto: CloseLostPetIncidentDto) {
    return this.incidents.close(petId, incidentId, dto.reason);
  }

  @Get(":incidentId/sightings")
  @RequirePetAccess("canViewIdentity")
  listSightings(@Param("petId") petId: string, @Param("incidentId") incidentId: string) {
    return this.incidents.listSightings(petId, incidentId);
  }

  @Post(":incidentId/sightings/:sightingId/review")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  reviewSighting(
    @Param("petId") petId: string,
    @Param("incidentId") incidentId: string,
    @Param("sightingId") sightingId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ReviewLostPetSightingDto,
  ) {
    return this.incidents.reviewSighting(petId, incidentId, sightingId, user.id, dto);
  }
}
