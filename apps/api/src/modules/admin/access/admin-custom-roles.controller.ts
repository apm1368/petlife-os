import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, ValidateIf } from "class-validator";
import { AdminVertical } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminCustomRolesService } from "./admin-custom-roles.service";

class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class CustomRoleDto extends ReasonDto {
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) permissions!: string[];
  @IsArray() @ArrayUnique() @IsEnum(AdminVertical, { each: true }) verticals!: AdminVertical[];
}
class AssignCustomRoleDto extends ReasonDto {
  @ValidateIf((_, value) => value !== null) @IsUUID() customRoleId!: string | null;
}
class ListCustomRolesQueryDto {
  @IsOptional() @IsIn(["true", "false"]) includeArchived?: "true" | "false";
}

/** Owner-defined roles. Reading is access.view; every change is admin.manage (SUPER_ADMIN) and needs a reason. */
@Controller("admin/access")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCustomRolesController {
  constructor(private readonly roles: AdminCustomRolesService) {}

  @Get("custom-roles")
  @Header("Cache-Control", "no-store")
  @RequireAdminPermission("access.view")
  list(@Query() q: ListCustomRolesQueryDto) {
    return this.roles.list(q.includeArchived === "true");
  }

  @Post("custom-roles")
  @RequireAdminPermission("admin.manage")
  create(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CustomRoleDto) {
    return this.roles.create(admin, dto, dto.reason);
  }

  @Put("custom-roles/:id")
  @RequireAdminPermission("admin.manage")
  update(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CustomRoleDto) {
    return this.roles.update(admin, id, dto, dto.reason);
  }

  @Post("custom-roles/:id/archive")
  @RequireAdminPermission("admin.manage")
  archive(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.roles.archive(admin, id, dto.reason);
  }

  @Put("admins/:id/custom-role")
  @RequireAdminPermission("admin.manage")
  assign(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignCustomRoleDto) {
    return this.roles.assign(admin, id, dto.customRoleId, dto.reason);
  }
}
