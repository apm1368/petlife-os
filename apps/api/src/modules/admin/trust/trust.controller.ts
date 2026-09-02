import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { TrustCaseService } from "./trust-case.service";
import { TrustActionService } from "./trust-action.service";
import { AssignTrustCaseDto, ListTrustCasesQueryDto, OpenTrustCaseDto, ResolveAppealDto, SubmitAppealDto, TakeTrustActionDto, TransitionTrustCaseDto } from "./dto/trust.dto";

@Controller("admin/trust")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class TrustController {
  constructor(
    private readonly cases: TrustCaseService,
    private readonly actions: TrustActionService,
  ) {}

  @Get("cases")
  @RequireAdminPermission("trust.view")
  list(@Query() query: ListTrustCasesQueryDto) {
    return this.cases.list({ status: query.status, assignedAdminId: query.assignedAdminId }, query);
  }

  @Post("cases")
  @RequireAdminPermission("trust.manage")
  open(@Body() dto: OpenTrustCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.open(admin, dto, request.requestId);
  }

  @Get("cases/:id")
  @RequireAdminPermission("trust.view")
  get(@Param("id") id: string) {
    return this.cases.get(id);
  }

  @Patch("cases/:id/assign")
  @RequireAdminPermission("trust.manage")
  assign(@Param("id") id: string, @Body() dto: AssignTrustCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.assign(admin, id, dto.assigneeAdminId, request.requestId);
  }

  @Patch("cases/:id/status")
  @RequireAdminPermission("trust.manage")
  transition(@Param("id") id: string, @Body() dto: TransitionTrustCaseDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.cases.transition(admin, id, dto.status, request.requestId);
  }

  @Post("cases/:id/actions")
  @RequireAdminPermission("trust.manage")
  takeAction(@Param("id") id: string, @Body() dto: TakeTrustActionDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.actions.take(admin, id, dto, request.requestId);
  }

  @Post("actions/:actionId/appeals")
  @RequireAdminPermission("trust.manage")
  submitAppeal(@Param("actionId") actionId: string, @Body() dto: SubmitAppealDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.actions.submitAppeal(admin, actionId, dto, request.requestId);
  }

  @Patch("appeals/:id")
  @RequireAdminPermission("trust.manage")
  resolveAppeal(@Param("id") id: string, @Body() dto: ResolveAppealDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.actions.resolveAppeal(admin, id, dto, request.requestId);
  }
}
