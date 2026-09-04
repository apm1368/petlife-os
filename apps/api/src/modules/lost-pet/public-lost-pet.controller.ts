import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { LostPetIncidentService } from "./lost-pet-incident.service";
import { RequestLostPetSightingPhotoUploadDto, SubmitLostPetSightingDto } from "./dto/lost-pet.dto";

/**
 * Public, anonymous-readable surface (spec: "share a lost-pet incident
 * without requiring recipient login") — no SessionAuthGuard/PetAccessGuard
 * at all, mirroring PublicBlogController's own "no guard by design"
 * precedent. OptionalSessionAuthGuard is used only on sighting submission,
 * to capture reporterUserId when the reporter happens to be signed in —
 * never to gate the endpoint itself.
 */
@Controller("lost-pets")
export class PublicLostPetController {
  constructor(private readonly incidents: LostPetIncidentService) {}

  @Get()
  list() {
    return this.incidents.listPublic();
  }

  @Get(":incidentId")
  get(@Param("incidentId") incidentId: string) {
    return this.incidents.getPublic(incidentId);
  }

  @Post(":incidentId/sightings/upload-url")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestSightingPhotoUpload(@Param("incidentId") incidentId: string, @Body() dto: RequestLostPetSightingPhotoUploadDto) {
    return this.incidents.requestSightingPhotoUpload(incidentId, dto.contentType, dto.fileSizeBytes);
  }

  @Post(":incidentId/sightings")
  @UseGuards(OptionalSessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submitSighting(@Param("incidentId") incidentId: string, @OptionalCurrentUser() user: SessionUser | undefined, @Body() dto: SubmitLostPetSightingDto) {
    return this.incidents.submitSighting(incidentId, user?.id, dto);
  }
}
