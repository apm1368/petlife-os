import { Body, Controller, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminVerificationService } from "./admin-verification.service";
import { TransitionProviderVerificationDto, TransitionSellerVerificationDto } from "./dto/verification.dto";

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminVerificationController {
  constructor(private readonly verification: AdminVerificationService) {}

  @Patch("providers/:id/verification")
  @RequireAdminPermission("verification.manage")
  transitionProvider(@Param("id") id: string, @Body() dto: TransitionProviderVerificationDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.verification.transitionProvider(admin, id, dto.status, dto.reason, request.requestId);
  }

  @Patch("sellers/:id/verification")
  @RequireAdminPermission("verification.manage")
  transitionSeller(@Param("id") id: string, @Body() dto: TransitionSellerVerificationDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.verification.transitionSeller(admin, id, dto.status, dto.reason, request.requestId);
  }
}
