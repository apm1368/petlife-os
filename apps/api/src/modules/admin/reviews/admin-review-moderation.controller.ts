import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import type { AdminReviewModerationStatus, AdminReviewVertical } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminReviewModerationService } from "./admin-review-moderation.service";

const VERTICALS = { SERVICE: "SERVICE", PRODUCT: "PRODUCT", TRAVEL: "TRAVEL" } as const;
const STATUSES = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PUBLISHED: "PUBLISHED",
  HIDDEN: "HIDDEN",
} as const;

export class AdminReviewListQueryDto extends PaginationQueryDto {
  @IsEnum(VERTICALS) vertical!: AdminReviewVertical;
  @IsOptional() @IsEnum(STATUSES) status?: AdminReviewModerationStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class ReviewDecisionDto {
  @IsOptional() @IsString() @MinLength(5) @MaxLength(500) reason?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  labels?: string[];
}

class ReviewRejectionDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  labels?: string[];
}

@Controller("admin/review-moderation")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminReviewModerationController {
  constructor(private readonly reviews: AdminReviewModerationService) {}

  @Get()
  @RequireAdminPermission("services.view", "commerce.view", "travel.view")
  list(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: AdminReviewListQueryDto) {
    return this.reviews.list(admin, query);
  }

  @Post(":vertical/:id/approve")
  @RequireAdminPermission("services.manage", "commerce.manage", "travel.manage")
  approve(
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Param("vertical") vertical: AdminReviewVertical,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReviewDecisionDto,
  ) {
    return this.reviews.decide(admin, vertical, id, "APPROVED", body.reason, body.labels ?? []);
  }

  @Post(":vertical/:id/reject")
  @RequireAdminPermission("services.manage", "commerce.manage", "travel.manage")
  reject(
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Param("vertical") vertical: AdminReviewVertical,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReviewRejectionDto,
  ) {
    return this.reviews.decide(admin, vertical, id, "REJECTED", body.reason, body.labels ?? []);
  }
}
