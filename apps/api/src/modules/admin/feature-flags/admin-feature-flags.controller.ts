import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from "class-validator";
import { FeatureFlagChangeStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminFeatureFlagsService } from "./admin-feature-flags.service";

const KEY = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
class FlagSnapshotDto {
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsBoolean() isEnabled!: boolean;
  @IsInt() @Min(0) rolloutPercentage!: number;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @Length(1, 64, { each: true }) cities!: string[];
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) betaUserIds!: string[];
}
class CreateFlagDto extends FlagSnapshotDto {
  @Matches(KEY) key!: string;
  @IsString() @Length(5, 500) reason!: string;
}
class UpdateFlagDto extends FlagSnapshotDto {
  @IsInt() @Min(1) baseVersion!: number;
  @IsString() @Length(5, 500) reason!: string;
}
class ReviewDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}
class ChangesQueryDto extends PaginationQueryDto {
  @IsOptional() @Matches(KEY) key?: string;
  @IsOptional() @IsIn(Object.values(FeatureFlagChangeStatus)) status?: FeatureFlagChangeStatus;
}

@Controller("admin/feature-flags")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminFeatureFlagsController {
  constructor(private readonly flags: AdminFeatureFlagsService) {}

  @Get()
  @RequireAdminPermission("settings.view")
  list() {
    return this.flags.list();
  }

  @Get("changes")
  @RequireAdminPermission("settings.view")
  changes(@Query() query: ChangesQueryDto) {
    return this.flags.changes(query);
  }

  @Get(":key")
  @RequireAdminPermission("settings.view")
  get(@Param("key") key: string) {
    return this.flags.get(key);
  }

  @Post()
  @RequireAdminPermission("settings.manage")
  create(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CreateFlagDto) {
    return this.flags.proposeCreate(admin, dto);
  }

  @Put(":key")
  @RequireAdminPermission("settings.manage")
  update(@CurrentAdmin() admin: ResolvedAdminContext, @Param("key") key: string, @Body() dto: UpdateFlagDto) {
    return this.flags.proposeUpdate(admin, key, dto);
  }

  @Post("changes/:id/review")
  @RequireAdminPermission("settings.approve")
  review(
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.flags.review(admin, id, dto.decision, dto.note);
  }

  @Post("changes/:id/cancel")
  @RequireAdminPermission("settings.manage")
  cancel(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.flags.cancel(admin, id);
  }
}
