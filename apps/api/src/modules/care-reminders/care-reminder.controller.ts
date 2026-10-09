import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CareReminderService } from "./care-reminder.service";
import { CreateReminderDto, EditReminderDto, ReminderActionDto } from "./care-reminder.dto";

@Controller("pets/:petId/care-items")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class CareReminderController {
  constructor(private readonly service: CareReminderService) {}
  @Get() @RequirePetAccess("canViewCareProfile")
  list(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser) { return this.service.list(petId, user.id); }
  @Get(":careItemId") @RequirePetAccess("canViewCareProfile")
  get(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) { return this.service.get(petId, id, user.id); }
  @Post() @RequirePetAccess("canEditCareProfile")
  create(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateReminderDto) { return this.service.create(petId, user.id, dto); }
  @Patch(":careItemId") @RequirePetAccess("canEditCareProfile")
  edit(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Body() dto: EditReminderDto) { return this.service.edit(petId, id, user.id, dto); }
  @Post(":careItemId/actions") @RequirePetAccess("canEditCareProfile")
  act(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Body() dto: ReminderActionDto) { return this.service.act(petId, id, user.id, dto); }
}
