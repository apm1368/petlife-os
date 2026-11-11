import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, Matches } from "class-validator";
import type { AdminReportGranularity } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { ApiException } from "../../../common/errors/api-exception";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminReportsService } from "./admin-reports.service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class ReportRangeQueryDto {
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @IsIn(["day", "week", "month"]) granularity?: AdminReportGranularity;
}

/** ERP reports: aggregate numbers only. Customer identities in the top list additionally need customer.view. */
@Controller("admin/reports")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get("overview")
  @RequireAdminPermission("analytics.view")
  @Header("Cache-Control", "no-store")
  overview(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: ReportRangeQueryDto) {
    let range;
    try {
      range = this.reports.resolveRange(query);
    } catch (error) {
      throw new ApiException("REPORT_RANGE_INVALID", error instanceof Error ? error.message : "Invalid report range.");
    }
    return this.reports.overview(admin, range);
  }
}
