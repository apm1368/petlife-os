import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CareProfileService } from "./care-profile.service";
import { UpdateCareProfileDto } from "./dto/update-care-profile.dto";

@Controller("pets/:petId/care-profile")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class CareProfileController {
  constructor(private readonly careProfileService: CareProfileService) {}

  @Get()
  @RequirePetAccess("canViewCareProfile")
  get(@Param("petId") petId: string) {
    return this.careProfileService.get(petId);
  }

  @Put()
  @RequirePetAccess("canEditCareProfile")
  upsert(@Param("petId") petId: string, @Body() dto: UpdateCareProfileDto) {
    return this.careProfileService.upsert(petId, dto);
  }
}
