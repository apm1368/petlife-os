import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CreateHouseholdDto } from "./dto/create-household.dto";
import { UpdateHouseholdDto } from "./dto/update-household.dto";
import { HouseholdsService } from "./households.service";

@Controller("households")
@UseGuards(SessionAuthGuard)
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateHouseholdDto) {
    return this.householdsService.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: SessionUser) {
    return this.householdsService.listForUser(user.id);
  }

  @Get(":id")
  @UseGuards(HouseholdMemberGuard)
  getById(@Param("id") id: string) {
    return this.householdsService.getById(id);
  }

  @Patch(":id")
  @UseGuards(HouseholdMemberGuard)
  update(@Param("id") id: string, @Body() dto: UpdateHouseholdDto) {
    return this.householdsService.update(id, dto);
  }
}
