import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";
import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
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
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(AdminVertical, { each: true }) serviceScopes?: AdminVertical[];
}
class ChangeRoleDto extends ReasonDto {
  @IsIn(Object.values(AdminRole)) role!: AdminRole;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(AdminVertical, { each: true }) serviceScopes?: AdminVertical[];
}
class ChangeScopesDto extends ReasonDto {
  @IsArray() @ArrayUnique() @IsEnum(AdminVertical, { each: true }) serviceScopes!: AdminVertical[];
}
class CreateCustomRoleDto extends ReasonDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{1,39}$/) key!: string;
  @IsString() @Length(2, 80) label!: string;
  @IsString() @Length(5, 300) description!: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) @Length(3, 80, { each: true }) permissions!: string[];
  @IsArray() @ArrayUnique() @IsEnum(AdminVertical, { each: true }) verticals!: AdminVertical[];
}
class ReviewCustomRoleDto extends ReasonDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
}
class CustomRoleAssignmentDto extends ReasonDto {
  @IsOptional() @IsUUID() customRoleId?: string | null;
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

  @Get("custom-roles")
  @RequireAdminPermission("access.view")
  customRoles() { return this.access.customRoles(); }

  @Post("custom-roles")
  @RequireAdminPermission("admin.manage")
  createCustomRole(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CreateCustomRoleDto) { return this.access.createCustomRole(admin, dto); }

  @Post("custom-roles/:id/review")
  @RequireAdminPermission("admin.manage")
  reviewCustomRole(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewCustomRoleDto) { return this.access.reviewCustomRole(admin, id, dto.decision, dto.reason); }

  @Post("admins/:id/custom-role-assignment")
  @RequireAdminPermission("admin.manage")
  requestCustomRoleAssignment(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CustomRoleAssignmentDto) { return this.access.requestCustomRoleAssignment(admin, id, dto.customRoleId ?? null, dto.reason); }

  @Post("custom-role-assignments/:id/review")
  @RequireAdminPermission("admin.manage")
  reviewCustomRoleAssignment(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewCustomRoleDto) { return this.access.reviewCustomRoleAssignment(admin, id, dto.decision, dto.reason); }

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
  changeRole(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) { return this.access.changeRole(admin, id, dto.role, dto.reason, dto.serviceScopes); }

  @Post("admins/:id/scopes")
  @RequireAdminPermission("admin.manage")
  changeScopes(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ChangeScopesDto) { return this.access.changeScopes(admin, id, dto.serviceScopes, dto.reason); }

  @Post("admins/:id/suspend")
  @RequireAdminPermission("admin.manage")
  suspend(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.access.setStatus(admin, id, AdminMembershipStatus.SUSPENDED, dto.reason); }

  @Post("admins/:id/reactivate")
  @RequireAdminPermission("admin.manage")
  reactivate(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.access.setStatus(admin, id, AdminMembershipStatus.ACTIVE, dto.reason); }
}
