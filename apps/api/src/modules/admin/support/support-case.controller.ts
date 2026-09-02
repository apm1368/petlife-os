import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { InternalNoteEntityType } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { InternalNoteService } from "../notes/internal-note.service";
import { SupportCaseService } from "./support-case.service";
import { AddInternalNoteDto, AssignSupportCaseDto, CreateSupportCaseDto, ListSupportCasesQueryDto, PostSupportMessageDto, TransitionSupportCaseDto } from "./dto/support-case.dto";

@Controller("admin/support")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class SupportCaseController {
  constructor(
    private readonly cases: SupportCaseService,
    private readonly notes: InternalNoteService,
  ) {}

  @Get()
  @RequireAdminPermission("support.view")
  list(@Query() query: ListSupportCasesQueryDto) {
    return this.cases.list({ status: query.status, assignedAdminId: query.assignedAdminId }, query);
  }

  @Post()
  @RequireAdminPermission("support.manage")
  create(@Body() dto: CreateSupportCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.create(admin, dto, request.requestId);
  }

  @Get(":id")
  @RequireAdminPermission("support.view")
  get(@Param("id") id: string) {
    return this.cases.get(id);
  }

  @Patch(":id/assign")
  @RequireAdminPermission("support.manage")
  assign(@Param("id") id: string, @Body() dto: AssignSupportCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.assign(admin, id, dto.assigneeAdminId, request.requestId);
  }

  @Patch(":id/status")
  @RequireAdminPermission("support.manage")
  transition(@Param("id") id: string, @Body() dto: TransitionSupportCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.transition(admin, id, dto.status, request.requestId);
  }

  @Post(":id/messages")
  @RequireAdminPermission("support.manage")
  postMessage(@Param("id") id: string, @Body() dto: PostSupportMessageDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.postMessage(admin, id, dto.body, dto.visibility, request.requestId);
  }

  @Post(":id/notes")
  @RequireAdminPermission("support.manage")
  addNote(@Param("id") id: string, @Body() dto: AddInternalNoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.notes.add(admin, InternalNoteEntityType.SUPPORT_CASE, id, dto.body, request.requestId);
  }
}
