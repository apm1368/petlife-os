import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { AccountDeletionState } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { PrivacyGovernanceService } from "./privacy-governance.service";

class DeletionListQueryDto {
  @IsOptional() @IsIn(Object.values(AccountDeletionState)) state?: AccountDeletionState;
}
class DeletionTransitionDto {
  @IsIn(Object.values(AccountDeletionState)) to!: AccountDeletionState;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Deletion lifecycle and the release gate are SUPER_ADMIN-only (admin.manage). */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPrivacyGovernanceController {
  constructor(private readonly governance: PrivacyGovernanceService) {}

  @Get("privacy/deletion-requests")
  @RequireAdminPermission("admin.manage")
  list(@Query() q: DeletionListQueryDto) {
    return this.governance.listDeletionRequests(q.state);
  }

  @Post("privacy/deletion-requests/:id/transition")
  @RequireAdminPermission("admin.manage")
  transition(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DeletionTransitionDto) {
    return this.governance.transition(admin, id, dto.to, dto.note);
  }

  @Get("release-gate")
  @RequireAdminPermission("admin.manage")
  releaseGate() {
    return this.governance.releaseGate();
  }
}
