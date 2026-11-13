import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Put, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsString, Length } from "class-validator";
import { ApprovalMode, ApprovalScope, PartnerSubjectType } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminPartnerApprovalService } from "./admin-partner-approval.service";

class SetApprovalModeDto {
  @IsIn(Object.values(ApprovalMode)) mode!: ApprovalMode;
  @IsString() @Length(5, 500) reason!: string;
}

class ClearApprovalModeDto {
  @IsString() @Length(5, 500) reason!: string;
}

/**
 * Approval mode on a partner profile (Admin → Partners → Services / Shops): per flow, inherit the vertical setting or
 * force Instant / Needs approval for this partner. Readable by whoever can open the profile (plus settings.view);
 * changing it is a platform-policy change, so it needs settings.manage — the same permission as the vertical setting.
 */
@Controller("admin/partners")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPartnerApprovalController {
  constructor(private readonly approvals: AdminPartnerApprovalService) {}

  @Get("services/:id/approval-modes")
  @RequireAdminPermission("services.view", "verification.manage", "customer.view", "settings.view")
  service(@Param("id", ParseUUIDPipe) id: string) {
    return this.approvals.get(PartnerSubjectType.PROVIDER, id);
  }

  @Put("services/:id/approval-modes/:scope")
  @RequireAdminPermission("settings.manage")
  setService(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("scope", new ParseEnumPipe(ApprovalScope)) scope: ApprovalScope, @Body() dto: SetApprovalModeDto) {
    return this.approvals.set(admin, PartnerSubjectType.PROVIDER, id, scope, dto.mode, dto.reason, req.requestId);
  }

  @Delete("services/:id/approval-modes/:scope")
  @RequireAdminPermission("settings.manage")
  clearService(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("scope", new ParseEnumPipe(ApprovalScope)) scope: ApprovalScope, @Body() dto: ClearApprovalModeDto) {
    return this.approvals.remove(admin, PartnerSubjectType.PROVIDER, id, scope, dto.reason, req.requestId);
  }

  @Get("shops/:id/approval-modes")
  @RequireAdminPermission("commerce.view", "verification.manage", "customer.view", "settings.view")
  shop(@Param("id", ParseUUIDPipe) id: string) {
    return this.approvals.get(PartnerSubjectType.SELLER, id);
  }

  @Put("shops/:id/approval-modes/:scope")
  @RequireAdminPermission("settings.manage")
  setShop(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("scope", new ParseEnumPipe(ApprovalScope)) scope: ApprovalScope, @Body() dto: SetApprovalModeDto) {
    return this.approvals.set(admin, PartnerSubjectType.SELLER, id, scope, dto.mode, dto.reason, req.requestId);
  }

  @Delete("shops/:id/approval-modes/:scope")
  @RequireAdminPermission("settings.manage")
  clearShop(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("scope", new ParseEnumPipe(ApprovalScope)) scope: ApprovalScope, @Body() dto: ClearApprovalModeDto) {
    return this.approvals.remove(admin, PartnerSubjectType.SELLER, id, scope, dto.reason, req.requestId);
  }
}
