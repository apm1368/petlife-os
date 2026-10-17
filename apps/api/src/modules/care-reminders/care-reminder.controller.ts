import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CareReminderService } from "./care-reminder.service";
import { ApplyCareTemplateDto, CareHistoryQueryDto, CreateReminderDto, EditReminderDto, ReminderActionDto } from "./care-reminder.dto";

@Controller("pets/:petId/care-items")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class CareReminderController {
  constructor(private readonly service: CareReminderService) {}
  @Get() @RequirePetAccess("canViewCareProfile")
  list(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser) { return this.service.list(petId, user.id); }
  /** Closed care (completed / skipped / cancelled), newest first, paginated. Declared before :careItemId. */
  @Get("history") @RequirePetAccess("canViewCareProfile")
  history(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Query() query: CareHistoryQueryDto) { return this.service.history(petId, user.id, query); }
  @Get(":careItemId") @RequirePetAccess("canViewCareProfile")
  get(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) { return this.service.get(petId, id, user.id); }
  @Post() @RequirePetAccess("canEditCareProfile")
  create(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateReminderDto) { return this.service.create(petId, user.id, dto); }
  @Patch(":careItemId") @RequirePetAccess("canEditCareProfile")
  edit(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Body() dto: EditReminderDto) { return this.service.edit(petId, id, user.id, dto); }
  @Post(":careItemId/actions") @RequirePetAccess("canEditCareProfile")
  act(@Param("petId", ParseUUIDPipe) petId: string, @Param("careItemId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Body() dto: ReminderActionDto) { return this.service.act(petId, id, user.id, dto); }
}

@Controller("pets/:petId/care-templates")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetCareTemplateController {
  constructor(private readonly service: CareReminderService) {}
  /** Creates only the items the member confirmed. */
  @Post("apply") @RequirePetAccess("canEditCareProfile")
  apply(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: ApplyCareTemplateDto) { return this.service.applyTemplate(petId, user.id, user.locale, dto); }
}

@Controller("care-templates")
@UseGuards(SessionAuthGuard)
export class CareTemplateCatalogController {
  constructor(private readonly service: CareReminderService) {}
  @Get()
  list(@CurrentUser() user: SessionUser) { return this.service.templates(user.locale); }
}
