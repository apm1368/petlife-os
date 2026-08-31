import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../common/session/session.service";
import { CreatePetDto } from "./dto/create-pet.dto";
import { PetsService } from "./pets.service";

@Controller("households/:householdId/pets")
@UseGuards(SessionAuthGuard, HouseholdMemberGuard)
export class HouseholdPetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get()
  list(@Param("householdId") householdId: string) {
    return this.petsService.listForHousehold(householdId);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  create(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePetDto) {
    return this.petsService.create(householdId, user.id, dto);
  }
}
