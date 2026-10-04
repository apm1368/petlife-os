import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CommunityReportReason } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CommunityReportService, type ReportTargetType } from "./community-report.service";

class ContentReportDto {
  @IsIn(["SUPPORT_NEED", "LOST_PET_INCIDENT", "LOST_PET_SIGHTING", "ORGANIZATION", "CHAT_MESSAGE"]) targetType!: ReportTargetType;
  @IsUUID() targetId!: string;
  @IsEnum(CommunityReportReason) reason!: CommunityReportReason;
  @IsOptional() @IsString() @MaxLength(1000) details?: string;
}

/** Batch 6 — one report endpoint for the animal-support, lost-pet and organization surfaces (community posts/comments keep theirs). */
@Controller("reports")
@UseGuards(SessionAuthGuard)
export class ContentReportController {
  constructor(private readonly reports: CommunityReportService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: SessionUser, @Body() dto: ContentReportDto) {
    return this.reports.reportTarget(dto.targetType, dto.targetId, user.id, { reason: dto.reason, details: dto.details });
  }
}
