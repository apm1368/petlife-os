import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { LifeTimelineService } from "./life-timeline.service";

/**
 * Gated behind canViewHealth (not canViewIdentity) since every response
 * wraps HealthTimelineEntryDto rows alongside Memories/lifecycle/lost-pet
 * entries — see LifeTimelineService's own doc comment.
 */
@Controller("pets/:petId/life-timeline")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class LifeTimelineController {
  constructor(private readonly lifeTimeline: LifeTimelineService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  get(@Param("petId") petId: string) {
    return this.lifeTimeline.list(petId, true);
  }
}
