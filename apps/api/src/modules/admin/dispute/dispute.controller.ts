import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { DisputeService } from "./dispute.service";
import { AddDisputeEvidenceDto, AssignDisputeDto, CreateDisputeDto, ListDisputesQueryDto, TransitionDisputeDto } from "./dto/dispute.dto";

@Controller("admin/disputes")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class DisputeController {
  constructor(private readonly disputes: DisputeService) {}

  @Get()
  @RequireAdminPermission("dispute.view")
  list(@Query() query: ListDisputesQueryDto) {
    return this.disputes.list({ status: query.status, assignedAdminId: query.assignedAdminId }, query);
  }

  @Post()
  @RequireAdminPermission("dispute.manage")
  create(@Body() dto: CreateDisputeDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.disputes.create(admin, dto, request.requestId);
  }

  @Get(":id")
  @RequireAdminPermission("dispute.view")
  get(@Param("id") id: string) {
    return this.disputes.get(id);
  }

  @Patch(":id/assign")
  @RequireAdminPermission("dispute.manage")
  assign(@Param("id") id: string, @Body() dto: AssignDisputeDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.disputes.assign(admin, id, dto.assigneeAdminId, request.requestId);
  }

  @Post(":id/evidence")
  @RequireAdminPermission("dispute.manage")
  addEvidence(@Param("id") id: string, @Body() dto: AddDisputeEvidenceDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.disputes.addEvidence(admin, id, dto, request.requestId);
  }

  @Patch(":id/status")
  @RequireAdminPermission("dispute.manage")
  transition(@Param("id") id: string, @Body() dto: TransitionDisputeDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.disputes.transition(admin, id, dto.status, dto.resolutionSummary, request.requestId);
  }
}
