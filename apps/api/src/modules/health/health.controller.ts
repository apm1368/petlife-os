import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { HealthSummaryService } from "./health-summary.service";
import { HealthProfileService } from "./health-profile.service";
import { UpdateHealthProfileDto } from "./dto/update-health-profile.dto";

@Controller("pets/:petId/health")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class HealthController {
  constructor(
    private readonly healthSummaryService: HealthSummaryService,
    private readonly healthProfileService: HealthProfileService,
  ) {}

  @Get("summary")
  @RequirePetAccess("canViewHealth")
  getSummary(@Param("petId") petId: string) {
    return this.healthSummaryService.getSummary(petId);
  }

  @Patch("profile")
  @RequirePetAccess("canEditHealth")
  updateProfile(@Param("petId") petId: string, @Body() dto: UpdateHealthProfileDto) {
    return this.healthProfileService.update(petId, dto);
  }
}
