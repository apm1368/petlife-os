import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { PetAccessFlags } from "@petlife/types";
import { CurrentUser, type AuthedRequest } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { PetSafetyService } from "./pet-safety.service";
import { CreateCareHandoffDto, CreateShareCardDto, UpsertEmergencyInfoDto } from "./pet-safety.dto";

type PetReq = AuthedRequest & { petAccess?: PetAccessFlags };

@Controller("pets/:petId")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetSafetyController {
  constructor(private readonly safety: PetSafetyService) {}

  /** Server-derived profile completeness: completedFields, missingFields, completionScore (0–100). */
  @Get("completeness")
  @RequirePetAccess("canViewIdentity")
  completeness(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.safety.completeness(petId);
  }

  @Get("emergency-info")
  @RequirePetAccess("canViewIdentity")
  emergencyInfo(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.safety.getEmergencyInfo(petId);
  }

  @Put("emergency-info")
  @RequirePetAccess("canEditIdentity")
  upsertEmergencyInfo(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: UpsertEmergencyInfoDto) {
    return this.safety.upsertEmergencyInfo(petId, user.id, dto);
  }

  /** Readers with health access, or a care-handoff recipient holding EMERGENCY_HEALTH. */
  @Get("emergency-snapshot")
  @RequirePetAccess("canViewIdentity")
  emergencySnapshot(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Req() req: PetReq) {
    return this.safety.emergencySnapshotFor(petId, user.id, req.petAccess!);
  }

  @Get("share-cards")
  @RequirePetAccess("canManageAccess")
  listCards(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.safety.listCards(petId);
  }

  @Post("share-cards")
  @RequirePetAccess("canManageAccess")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createCard(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateShareCardDto) {
    return this.safety.createCard(petId, user.id, dto);
  }

  @Post("share-cards/:cardId/rotate")
  @RequirePetAccess("canManageAccess")
  rotateCard(@Param("petId", ParseUUIDPipe) petId: string, @Param("cardId", ParseUUIDPipe) cardId: string, @CurrentUser() user: SessionUser) {
    return this.safety.rotateCard(petId, cardId, user.id);
  }

  @Post("share-cards/:cardId/revoke")
  @RequirePetAccess("canManageAccess")
  revokeCard(@Param("petId", ParseUUIDPipe) petId: string, @Param("cardId", ParseUUIDPipe) cardId: string, @CurrentUser() user: SessionUser) {
    return this.safety.revokeCard(petId, cardId, user.id);
  }

  @Get("care-handoffs")
  @RequirePetAccess("canManageAccess")
  listHandoffs(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.safety.listHandoffs(petId);
  }

  @Post("care-handoffs")
  @RequirePetAccess("canManageAccess")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createHandoff(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Req() req: PetReq, @Body() dto: CreateCareHandoffDto) {
    return this.safety.createHandoff(petId, user.id, req.petAccess!, dto);
  }

  @Delete("care-handoffs/:grantId")
  @RequirePetAccess("canManageAccess")
  revokeHandoff(@Param("petId", ParseUUIDPipe) petId: string, @Param("grantId", ParseUUIDPipe) grantId: string, @CurrentUser() user: SessionUser) {
    return this.safety.revokeHandoff(petId, grantId, user.id);
  }
}

@Controller("me/care-handoffs")
@UseGuards(SessionAuthGuard)
export class MyCareHandoffsController {
  constructor(private readonly safety: PetSafetyService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.safety.myHandoffs(user.id);
  }
}

/** Public, unauthenticated read of a share card by token (emergency card or QR ID tag). */
@Controller("public/pet-cards")
export class PublicPetCardController {
  constructor(private readonly safety: PetSafetyService) {}

  @Get(":token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  read(@Param("token") token: string) {
    return this.safety.readPublicCard(token);
  }
}
