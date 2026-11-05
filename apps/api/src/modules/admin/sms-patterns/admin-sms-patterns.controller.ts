import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsString, Length, Matches, Min } from "class-validator";
import { Locale } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminSmsPatternsService } from "./admin-sms-patterns.service";

const PATTERN_KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
class PatternFieldsDto {
  @IsString() @Length(1, 140) displayName!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,128}$/) farazPatternCode!: string;
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]{0,63}$/) bodyAttributeKey!: string;
  @IsBoolean() isActive!: boolean;
}
class CreatePatternDto extends PatternFieldsDto {
  @Matches(PATTERN_KEY) key!: string;
  @IsIn([Locale.fa, Locale.en]) locale!: Locale;
}
class UpdatePatternDto extends PatternFieldsDto {
  @IsInt() @Min(1) baseVersion!: number;
}

@Controller("admin/sms-patterns")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSmsPatternsController {
  constructor(private readonly patterns: AdminSmsPatternsService) {}

  @Get()
  @RequireAdminPermission("system.view")
  list() {
    return this.patterns.list();
  }

  @Post()
  @RequireAdminPermission("settings.manage")
  create(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CreatePatternDto) {
    return this.patterns.create(admin, dto.key, dto.locale, dto);
  }

  @Put(":id")
  @RequireAdminPermission("settings.manage")
  update(
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatternDto,
  ) {
    return this.patterns.update(admin, id, dto.baseVersion, dto);
  }
}
