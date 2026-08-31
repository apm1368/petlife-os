import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ActivePetService } from "./active-pet.service";

class SetActivePetDto {
  @IsUUID()
  petId!: string;
}

@Controller("households/:householdId/active-pet")
@UseGuards(SessionAuthGuard, HouseholdMemberGuard)
export class ActivePetController {
  constructor(private readonly activePetService: ActivePetService) {}

  @Get()
  get(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser) {
    return this.activePetService.getActivePet(user.id, householdId);
  }

  @Put()
  set(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: SetActivePetDto) {
    return this.activePetService.setActivePet(user.id, householdId, dto.petId);
  }
}
