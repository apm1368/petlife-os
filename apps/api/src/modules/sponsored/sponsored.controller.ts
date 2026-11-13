import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SponsoredPlacement } from "@prisma/client";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import type { Request, Response } from "express";
import type { SponsoredCampaignDto, SponsoredOverviewDto, SponsoredSlotDto, SponsoredTargetDto } from "@petlife/types";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser, OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { BusinessWalletService } from "../commerce/payments/business-wallet.service";
import { SPONSORED_LOCALES } from "./sponsored-policy";
import { SponsoredService } from "./sponsored.service";

class SlotsQueryDto {
  @IsIn(Object.values(SponsoredPlacement)) placement!: SponsoredPlacement;
  @IsOptional() @IsUUID() category?: string;
  @IsOptional() @IsIn(["DOG", "CAT"]) species?: string;
  @IsOptional() @IsString() @Length(1, 30) serviceCategory?: string;
  @IsOptional() @IsString() @Length(1, 80) city?: string;
}

class ClickQueryDto {
  @IsOptional() @IsIn(SPONSORED_LOCALES as unknown as string[]) l?: string;
}

class TargetsQueryDto {
  @IsOptional() @IsString() @Length(1, 120) q?: string;
}

class CreateCampaignDto {
  @IsIn(Object.values(SponsoredPlacement)) placement!: SponsoredPlacement;
  @IsOptional() @IsUUID() productId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000_000) dailyBudgetIrr!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) maxCpcIrr!: number;
}

class UpdateCampaignDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000_000) dailyBudgetIrr!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) maxCpcIrr!: number;
}

/**
 * Public side of sponsored listings: the slots above a list (no member data used — only the list's own filters) and
 * the click redirect, which logs every click and bills at most one per listing per day per viewer and per IP.
 */
@Controller("sponsored")
export class SponsoredPublicController {
  constructor(private readonly sponsored: SponsoredService) {}

  @Get("slots")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  slots(@Query() query: SlotsQueryDto): Promise<SponsoredSlotDto[]> {
    return this.sponsored.slots(query.placement, { category: query.category, species: query.species, serviceCategory: query.serviceCategory, city: query.city });
  }

  @Get("c/:campaignId")
  @UseGuards(OptionalSessionAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async click(@Param("campaignId", ParseUUIDPipe) campaignId: string, @Query() query: ClickQueryDto, @OptionalCurrentUser() user: SessionUser | undefined, @Req() req: Request, @Res() res: Response) {
    const target = await this.sponsored.click(campaignId, { locale: query.l ?? "fa", viewerUserId: user?.id, ip: req.ip, userAgent: req.headers["user-agent"], headers: req.headers });
    if (!target) throw new NotFoundException();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.redirect(302, target);
  }
}

/** A partner's sponsored listings, paid from the organisation's business wallet; only its wallet managers (404 otherwise). */
@Controller("wallet/accounts/:accountId/sponsored")
@UseGuards(SessionAuthGuard)
export class SponsoredPartnerController {
  constructor(private readonly sponsored: SponsoredService, private readonly business: BusinessWalletService) {}

  @Get()
  async overview(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string): Promise<SponsoredOverviewDto> {
    return this.sponsored.overview(await this.business.assertManager(user.id, accountId));
  }

  @Get("targets")
  async targets(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Query() query: TargetsQueryDto): Promise<SponsoredTargetDto[]> {
    return this.sponsored.targets(await this.business.assertManager(user.id, accountId), query.q);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Body() dto: CreateCampaignDto): Promise<SponsoredCampaignDto> {
    return this.sponsored.create(user.id, await this.business.assertManager(user.id, accountId), dto);
  }

  @Patch(":id")
  async update(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto): Promise<SponsoredCampaignDto> {
    return this.sponsored.update(await this.business.assertManager(user.id, accountId), id, dto);
  }

  @Post(":id/pause")
  async pause(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Param("id", ParseUUIDPipe) id: string): Promise<SponsoredCampaignDto> {
    return this.sponsored.setStatus(await this.business.assertManager(user.id, accountId), id, "pause");
  }

  @Post(":id/resume")
  async resume(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Param("id", ParseUUIDPipe) id: string): Promise<SponsoredCampaignDto> {
    return this.sponsored.setStatus(await this.business.assertManager(user.id, accountId), id, "resume");
  }

  @Post(":id/stop")
  async stop(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Param("id", ParseUUIDPipe) id: string): Promise<SponsoredCampaignDto> {
    return this.sponsored.setStatus(await this.business.assertManager(user.id, accountId), id, "stop");
  }
}
