import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminCardTransferDestinationService } from "./admin-card-transfer-destination.service";

class ChangeDestinationDto {
  @IsOptional() @IsString() @Length(0, 40) cardNumber?: string;
  @IsOptional() @IsString() @Length(0, 40) sheba?: string;
  @IsString() @Length(3, 120) holderName!: string;
  @IsOptional() @IsString() @Length(0, 80) bankName?: string;
  @IsString() @Length(10, 500) reason!: string;
}

class ReasonDto {
  @IsString() @Length(10, 500) reason!: string;
}

/**
 * The company card-to-card account (owner request): finance can see it masked (wallet.view); only a SUPER_ADMIN with
 * settings.manage can propose a new one or switch it off, with a reason, an audit row and a notice to every
 * SUPER_ADMIN. A proposal takes effect only when a different SUPER_ADMIN approves it (BO-14); switching off is
 * immediate.
 */
@Controller("admin/finance/card-transfer-destination")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCardTransferDestinationController {
  constructor(private readonly destinations: AdminCardTransferDestinationService) {}

  @Get()
  @RequireAdminPermission("wallet.view")
  overview(@CurrentAdmin() admin: ResolvedAdminContext) {
    return this.destinations.overview(admin);
  }

  /** Proposes a new account; it stays PENDING (members keep the current one) until another super admin approves it. */
  @Put()
  @RequireAdminPermission("settings.manage")
  change(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: ChangeDestinationDto, @Req() req: AdminAuthedRequest) {
    return this.destinations.change(admin, dto, req.requestId);
  }

  @Post("pending/:id/approve")
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission("settings.manage")
  approve(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() req: AdminAuthedRequest) {
    return this.destinations.approve(admin, id, req.requestId);
  }

  /** Rejects a proposal (any other super admin) or withdraws it (its proposer); nothing changes for members. */
  @Post("pending/:id/reject")
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission("settings.manage")
  reject(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: AdminAuthedRequest) {
    return this.destinations.reject(admin, id, dto.reason, req.requestId);
  }

  /** The kill switch: immediate, no second approval. */
  @Post("deactivate")
  @RequireAdminPermission("settings.manage")
  deactivate(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: ReasonDto, @Req() req: AdminAuthedRequest) {
    return this.destinations.deactivate(admin, dto.reason, req.requestId);
  }
}
