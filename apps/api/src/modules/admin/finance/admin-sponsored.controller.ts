import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SponsoredCampaignStatus, SponsoredPlacement } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import type { AdminSponsoredCampaignDetailDto, AdminSponsoredCampaignDto, AdminSponsoredRateDto, PaginatedDto } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminSponsoredService } from "./admin-sponsored.service";

class ListCampaignsQueryDto {
  @IsOptional() @IsIn(Object.values(SponsoredCampaignStatus)) status?: SponsoredCampaignStatus;
  @IsOptional() @IsIn(Object.values(SponsoredPlacement)) placement?: SponsoredPlacement;
  @IsOptional() @IsString() @Length(1, 120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}

class RefundClicksDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID("all", { each: true }) clickIds!: string[];
  @IsString() @Length(5, 500) reason!: string;
}

class SetRateDto {
  @Type(() => Number) @IsInt() @Min(1_000) @Max(10_000_000) rateIrr!: number;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsString() @Length(5, 500) reason!: string;
}

/**
 * Sponsored listings in the back office: campaigns and spend, holds and stops (promotions.manage), crediting back
 * invalid clicks (wallet.adjust: it moves money) and the flat price per click (settings.manage to set it).
 */
@Controller("admin/sponsored")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSponsoredController {
  constructor(private readonly sponsored: AdminSponsoredService) {}

  @Get("campaigns")
  @RequireAdminPermission("promotions.manage")
  list(@Query() query: ListCampaignsQueryDto): Promise<PaginatedDto<AdminSponsoredCampaignDto>> {
    return this.sponsored.list({ status: query.status, placement: query.placement, q: query.q, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Get("campaigns/:id")
  @RequireAdminPermission("promotions.manage")
  detail(@Param("id", ParseUUIDPipe) id: string): Promise<AdminSponsoredCampaignDetailDto> {
    return this.sponsored.detail(id);
  }

  @Post("campaigns/:id/hold")
  @RequireAdminPermission("promotions.manage")
  hold(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: AdminAuthedRequest): Promise<AdminSponsoredCampaignDto> {
    return this.sponsored.moderate(admin, id, "hold", dto.reason, req.requestId);
  }

  @Post("campaigns/:id/release")
  @RequireAdminPermission("promotions.manage")
  release(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() req: AdminAuthedRequest): Promise<AdminSponsoredCampaignDto> {
    return this.sponsored.moderate(admin, id, "release", undefined, req.requestId);
  }

  @Post("campaigns/:id/stop")
  @RequireAdminPermission("promotions.manage")
  stop(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() req: AdminAuthedRequest): Promise<AdminSponsoredCampaignDto> {
    return this.sponsored.moderate(admin, id, "stop", dto.reason, req.requestId);
  }

  @Post("clicks/refund")
  @RequireAdminPermission("wallet.adjust")
  refund(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: RefundClicksDto, @Req() req: AdminAuthedRequest): Promise<{ refunded: number; amountIrr: number }> {
    return this.sponsored.refundClicks(admin, dto.clickIds, dto.reason, req.requestId);
  }

  @Get("rate")
  @RequireAdminPermission("settings.view")
  rate(): Promise<AdminSponsoredRateDto> {
    return this.sponsored.rate();
  }

  @Post("rate")
  @RequireAdminPermission("settings.manage")
  setRate(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: SetRateDto, @Req() req: AdminAuthedRequest): Promise<AdminSponsoredRateDto> {
    return this.sponsored.setRate(admin, dto, req.requestId);
  }
}
