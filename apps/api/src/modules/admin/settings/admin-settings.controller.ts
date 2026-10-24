import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Allow, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import { PlatformSettingChangeStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminSettingsService } from "./admin-settings.service";

class ProposeSettingDto {
  // Any JSON (null clears a localized text); validated against the setting definition in the service.
  @Allow() value!: unknown;
  @IsInt() @Min(0) baseVersion!: number;
  @IsString() @Length(5, 500) reason!: string;
}
class ReviewSettingDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
class ChangesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Matches(/^[a-z]+\.[A-Za-z]+$/) key?: string;
  @IsOptional() @IsIn(Object.values(PlatformSettingChangeStatus)) status?: PlatformSettingChangeStatus;
}

@Controller("admin/settings")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @RequireAdminPermission("settings.view")
  list() { return this.settings.list(); }

  @Get("changes")
  @RequireAdminPermission("settings.view")
  changes(@Query() q: ChangesQueryDto) { return this.settings.changes(q); }

  @Put(":key")
  @RequireAdminPermission("settings.manage")
  propose(@CurrentAdmin() admin: ResolvedAdminContext, @Param("key") key: string, @Body() dto: ProposeSettingDto) { return this.settings.propose(admin, key, dto); }

  @Post("changes/:id/review")
  @RequireAdminPermission("settings.approve")
  review(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewSettingDto) { return this.settings.review(admin, id, dto.decision, dto.note); }

  @Post("changes/:id/cancel")
  @RequireAdminPermission("settings.manage")
  cancel(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.settings.cancel(admin, id); }
}
