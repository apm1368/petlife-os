import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CommunityModerationService } from "./community-moderation.service";
import { DismissCommunityReportDto, EscalateCommunityReportDto, ListCommunityReportsQueryDto } from "../../community/dto/community.dto";

/** spec: "reuse Trust & Safety / Admin infrastructure" — gated by the existing trust.view/trust.manage permissions, never a new Community-specific permission. */
@Controller("admin/community")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCommunityController {
  constructor(private readonly moderation: CommunityModerationService) {}

  @Get("reports")
  @RequireAdminPermission("trust.view")
  listReports(@Query() query: ListCommunityReportsQueryDto) {
    return this.moderation.list(query);
  }

  @Post("reports/:reportId/escalate")
  @RequireAdminPermission("trust.manage")
  escalate(@Param("reportId") reportId: string, @Body() dto: EscalateCommunityReportDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.moderation.escalate(admin, reportId, dto);
  }

  @Post("reports/:reportId/dismiss")
  @RequireAdminPermission("trust.manage")
  dismiss(@Param("reportId") reportId: string, @Body() dto: DismissCommunityReportDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.moderation.dismiss(admin, reportId, dto.reason);
  }
}
