import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsIn, IsString, IsUUID, Length, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CreateHouseholdDto } from "./dto/create-household.dto";
import { UpdateHouseholdDto } from "./dto/update-household.dto";
import { HouseholdsService } from "./households.service";

class InitialPetAccessDto {
  @IsUUID()
  petId!: string;

  @IsIn(["VIEW_ONLY", "CARE_HELPER", "FULL"])
  preset!: "VIEW_ONLY" | "CARE_HELPER" | "FULL";
}

class ChangeMemberRoleDto {
  @IsIn(["OWNER", "FAMILY"])
  role!: "OWNER" | "FAMILY";
}

class InviteMemberDto {
  @IsString()
  @Length(5, 200)
  contact!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialPetAccessDto)
  initialAccess!: InitialPetAccessDto[];
}

@Controller("households")
@UseGuards(SessionAuthGuard)
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateHouseholdDto) { return this.householdsService.create(user.id, dto); }

  @Get()
  listMine(@CurrentUser() user: SessionUser) { return this.householdsService.listForUser(user.id); }

  @Get(":id")
  @UseGuards(HouseholdMemberGuard)
  getById(@Param("id") id: string) { return this.householdsService.getById(id); }

  @Get(":id/collaboration")
  @UseGuards(HouseholdMemberGuard)
  collaboration(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.getCollaboration(id, user.id);
  }

  @Patch(":id")
  @UseGuards(HouseholdMemberGuard)
  update(@Param("id") id: string, @CurrentUser() user: SessionUser, @Body() dto: UpdateHouseholdDto) {
    return this.householdsService.update(id, user.id, dto);
  }

  @Post(":id/invitations")
  @UseGuards(HouseholdMemberGuard)
  invite(@Param("id") id: string, @CurrentUser() user: SessionUser, @Body() dto: InviteMemberDto) {
    return this.householdsService.invite(id, user.id, dto);
  }

  @Delete(":id/members/:memberId")
  @UseGuards(HouseholdMemberGuard)
  removeMember(@Param("id") id: string, @Param("memberId", ParseUUIDPipe) memberId: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.removeMember(id, memberId, user.id);
  }

  @Patch(":id/members/:memberId")
  @UseGuards(HouseholdMemberGuard)
  changeRole(@Param("id") id: string, @Param("memberId", ParseUUIDPipe) memberId: string, @Body() dto: ChangeMemberRoleDto, @CurrentUser() user: SessionUser) {
    return this.householdsService.changeRole(id, memberId, dto.role, user.id);
  }

  @Post(":id/leave")
  @UseGuards(HouseholdMemberGuard)
  leave(@Param("id") id: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.leave(id, user.id);
  }

  @Post(":id/invitations/:invitationId/resend")
  @UseGuards(HouseholdMemberGuard)
  resend(@Param("id") id: string, @Param("invitationId") invitationId: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.resendInvitation(id, invitationId, user.id);
  }

  @Delete(":id/invitations/:invitationId")
  @UseGuards(HouseholdMemberGuard)
  cancel(@Param("id") id: string, @Param("invitationId") invitationId: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.cancelInvitation(id, invitationId, user.id);
  }
}

@Controller("household-invitations")
@UseGuards(SessionAuthGuard)
export class HouseholdInvitationsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get(":token")
  inspect(@Param("token") token: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.inspectInvitation(token, user.id);
  }

  @Post(":token/accept")
  accept(@Param("token") token: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.acceptInvitation(token, user.id);
  }

  @Post(":token/decline")
  decline(@Param("token") token: string, @CurrentUser() user: SessionUser) {
    return this.householdsService.declineInvitation(token, user.id);
  }
}
