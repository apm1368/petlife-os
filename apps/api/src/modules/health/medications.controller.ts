import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { MedicationsService } from "./medications.service";
import { CreateMedicationDto } from "./dto/create-medication.dto";
import { UpdateMedicationDto } from "./dto/update-medication.dto";

@Controller("pets/:petId/health/medications")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  list(@Param("petId") petId: string) {
    return this.medicationsService.list(petId);
  }

  @Post()
  @RequirePetAccess("canEditHealth")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateMedicationDto) {
    return this.medicationsService.create(petId, user.id, dto);
  }

  @Patch(":id")
  @RequirePetAccess("canEditHealth")
  update(@Param("petId") petId: string, @Param("id") id: string, @Body() dto: UpdateMedicationDto) {
    return this.medicationsService.update(petId, id, dto);
  }
}
