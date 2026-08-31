import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { AllergiesService } from "./allergies.service";
import { CreateAllergyDto } from "./dto/create-allergy.dto";
import { UpdateAllergyDto } from "./dto/update-allergy.dto";

@Controller("pets/:petId/health/allergies")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class AllergiesController {
  constructor(private readonly allergiesService: AllergiesService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  list(@Param("petId") petId: string) {
    return this.allergiesService.list(petId);
  }

  @Post()
  @RequirePetAccess("canEditHealth")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateAllergyDto) {
    return this.allergiesService.create(petId, user.id, dto);
  }

  @Patch(":id")
  @RequirePetAccess("canEditHealth")
  update(@Param("petId") petId: string, @Param("id") id: string, @Body() dto: UpdateAllergyDto) {
    return this.allergiesService.update(petId, id, dto);
  }

  @Delete(":id")
  @RequirePetAccess("canEditHealth")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("petId") petId: string, @Param("id") id: string): Promise<void> {
    await this.allergiesService.remove(petId, id);
  }
}
