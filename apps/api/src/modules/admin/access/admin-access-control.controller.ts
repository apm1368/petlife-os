import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, Length } from "class-validator";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAccessControlService } from "./admin-access-control.service";

class ListAdminsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(AdminRole)) role?: AdminRole;
  @IsOptional() @IsIn(Object.values(AdminMembershipStatus)) status?: AdminMembershipStatus;
  @IsOptional() @IsString() @Length(1, 100) q?: string;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class GrantAdminDto extends ReasonDto {
  @IsEmail() email!: string;
  @IsIn(Object.values(AdminRole)) role!: AdminRole;
}
class ChangeRoleDto extends ReasonDto {
  @IsIn(Object.values(AdminRole)) role!: AdminRole;
}

/** Access Control: reading is access.view (ADMIN, SUPER_ADMIN); every change is admin.manage (SUPER_ADMIN only) and needs a reason. */
@Controller("admin/access")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminAccessControlController {
  constructor(private readonly access: AdminAccessControlService) {}

  @Get("roles")
  @RequireAdminPermission("access.view")
  roles() { return this.access.roles(); }

  @Get("permissions")
  @RequireAdminPermission("access.view")
  permissions() { return this.access.permissions(); }

  @Get("admins")
  @RequireAdminPermission("access.view")
  list(@Query() q: ListAdminsQueryDto) { return this.access.list(q); }

  @Get("admins/:id")
  @RequireAdminPermission("access.view")
  get(@Param("id", ParseUUIDPipe) id: string) { return this.access.get(id); }

  @Post("admins")
  @RequireAdminPermission("admin.manage")
  grant(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: GrantAdminDto) { return this.access.grant(admin, dto); }

  @Post("admins/:id/role")
  @RequireAdminPermission("admin.manage")
  changeRole(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) { return this.access.changeRole(admin, id, dto.role, dto.reason); }

  @Post("admins/:id/suspend")
  @RequireAdminPermission("admin.manage")
  suspend(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.access.setStatus(admin, id, AdminMembershipStatus.SUSPENDED, dto.reason); }

  @Post("admins/:id/reactivate")
  @RequireAdminPermission("admin.manage")
  reactivate(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.access.setStatus(admin, id, AdminMembershipStatus.ACTIVE, dto.reason); }
}
