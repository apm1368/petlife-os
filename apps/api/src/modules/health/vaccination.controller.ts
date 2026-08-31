import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { VaccinationService } from "./vaccination.service";
import { UpdateVaccinationSummaryDto } from "./dto/update-vaccination-summary.dto";

@Controller("pets/:petId/health/vaccination-summary")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class VaccinationController {
  constructor(private readonly vaccinationService: VaccinationService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  get(@Param("petId") petId: string) {
    return this.vaccinationService.get(petId);
  }

  @Put()
  @RequirePetAccess("canEditHealth")
  upsert(@Param("petId") petId: string, @Body() dto: UpdateVaccinationSummaryDto) {
    return this.vaccinationService.upsert(petId, dto);
  }
}
