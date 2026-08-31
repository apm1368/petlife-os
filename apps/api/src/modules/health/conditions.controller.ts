import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ConditionsService } from "./conditions.service";
import { CreateConditionDto } from "./dto/create-condition.dto";
import { UpdateConditionDto } from "./dto/update-condition.dto";

@Controller("pets/:petId/health/conditions")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class ConditionsController {
  constructor(private readonly conditionsService: ConditionsService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  list(@Param("petId") petId: string) {
    return this.conditionsService.list(petId);
  }

  @Post()
  @RequirePetAccess("canEditHealth")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateConditionDto) {
    return this.conditionsService.create(petId, user.id, dto);
  }

  @Patch(":id")
  @RequirePetAccess("canEditHealth")
  update(@Param("petId") petId: string, @Param("id") id: string, @Body() dto: UpdateConditionDto) {
    return this.conditionsService.update(petId, id, dto);
  }
}
