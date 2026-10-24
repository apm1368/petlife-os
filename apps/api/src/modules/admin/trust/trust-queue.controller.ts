import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { TrustCaseSeverity } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { TrustQueueService, type QueueKind } from "./trust-queue.service";

const KEY = /^(REPORT|PLACE_REPORT|TRUST_CASE|APPEAL):[A-Z_]*:?[0-9a-f-]{36}$/;
class QueueQueryDto {
  @IsOptional() @IsIn(["REPORT", "PLACE_REPORT", "TRUST_CASE", "APPEAL"]) kind?: QueueKind;
  @IsOptional() @IsIn(Object.values(TrustCaseSeverity)) severity?: TrustCaseSeverity;
  @IsOptional() @IsIn(["me", "unassigned", "any"]) assigned?: "me" | "unassigned" | "any";
  @IsOptional() @Transform(({ value }) => value === "true" || value === true) @IsBoolean() breachedOnly?: boolean;
  @IsOptional() @IsString() @Length(2, 40) subjectType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
class KeyDto { @IsString() @Matches(KEY) key!: string; @IsOptional() @IsString() @Length(3, 500) reason?: string; }
class DismissDto { @IsString() @Matches(KEY) key!: string; @IsString() @Length(5, 500) reason!: string; }

/** ERP-G unified Trust & Safety queue (read model over reports, place reports, cases and appeals). */
@Controller("admin/trust/queue")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class TrustQueueController {
  constructor(private readonly queue: TrustQueueService) {}

  @Get() @RequireAdminPermission("trust.view") list(@CurrentAdmin() a: ResolvedAdminContext, @Query() q: QueueQueryDto) { return this.queue.queue(a, q); }
  @Get("summary") @RequireAdminPermission("trust.view") summary() { return this.queue.summary(); }
  @Post("claim") @RequireAdminPermission("trust.manage") claim(@CurrentAdmin() a: ResolvedAdminContext, @Body() dto: KeyDto) { return this.queue.setAssignee(a, dto.key, true, dto.reason); }
  @Post("release") @RequireAdminPermission("trust.manage") release(@CurrentAdmin() a: ResolvedAdminContext, @Body() dto: KeyDto) { return this.queue.setAssignee(a, dto.key, false, dto.reason); }
  @Post("dismiss") @RequireAdminPermission("trust.manage") dismiss(@CurrentAdmin() a: ResolvedAdminContext, @Body() dto: DismissDto) { return this.queue.dismissGroup(a, dto.key, dto.reason); }
}
