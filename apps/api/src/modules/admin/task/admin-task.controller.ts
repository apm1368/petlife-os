import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminTaskService } from "./admin-task.service";
import { CreateAdminTaskDto, ListAdminTasksQueryDto, UpdateAdminTaskDto } from "./dto/admin-task.dto";

@Controller("admin/tasks")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTaskController {
  constructor(private readonly tasks: AdminTaskService) {}

  @Get()
  @RequireAdminPermission("task.manage")
  list(@Query() query: ListAdminTasksQueryDto) {
    return this.tasks.list({ status: query.status, assigneeAdminId: query.assigneeAdminId }, query);
  }

  @Post()
  @RequireAdminPermission("task.manage")
  create(@Body() dto: CreateAdminTaskDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.tasks.create(admin, dto, request.requestId);
  }

  @Patch(":id")
  @RequireAdminPermission("task.manage")
  update(@Param("id") id: string, @Body() dto: UpdateAdminTaskDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.tasks.update(admin, id, dto, request.requestId);
  }
}
