import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { WalletAdjustmentDirection, WalletBalanceType, WalletTopUpStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { WalletAdjustmentReasonCode } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminWalletsService, WALLET_ADJUSTMENT_REASON_CODES } from "./admin-wallets.service";

class ListWalletsQueryDto {
  @IsOptional() @IsString() @Length(1, 120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class ListTopUpsQueryDto {
  @IsOptional() @IsIn(Object.values(WalletTopUpStatus)) status?: WalletTopUpStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class WalletAdjustmentDto {
  @IsIn(Object.values(WalletAdjustmentDirection)) direction!: WalletAdjustmentDirection;
  @IsIn(Object.values(WalletBalanceType)) balanceType!: WalletBalanceType;
  @IsInt() @Min(1) amount!: number;
  @IsIn(WALLET_ADJUSTMENT_REASON_CODES) reasonCode!: WalletAdjustmentReasonCode;
  @IsString() @Length(5, 500) reason!: string;
  @IsOptional() @IsString() @Length(1, 200) evidenceReference?: string;
}

class ReviewTopUpDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsInt() @Min(0) receivedAmount?: number;
  @IsOptional() @IsString() @Length(5, 500) reason?: string;
}

/** Member wallets in the back office: read with wallet.view, correct with wallet.adjust, settle receipts with wallet.topup.review. */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminWalletsController {
  constructor(private readonly wallets: AdminWalletsService) {}

  @Get("wallets")
  @RequireAdminPermission("wallet.view")
  list(@Query() query: ListWalletsQueryDto) {
    return this.wallets.list({ q: query.q, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Get("wallets/:userId")
  @RequireAdminPermission("wallet.view")
  detail(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.wallets.detail(userId);
  }

  @Post("wallets/:userId/adjustments")
  @RequireAdminPermission("wallet.adjust")
  adjust(
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: WalletAdjustmentDto,
    @Req() request: AdminAuthedRequest,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.wallets.adjust(admin, userId, dto, idempotencyKey, request.requestId);
  }

  @Get("wallet-top-ups")
  @RequireAdminPermission("wallet.view")
  listTopUps(@Query() query: ListTopUpsQueryDto) {
    return this.wallets.listTopUps({ status: query.status, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Post("wallet-top-ups/:id/review")
  @RequireAdminPermission("wallet.topup.review")
  review(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewTopUpDto, @Req() request: AdminAuthedRequest) {
    return this.wallets.reviewTopUp(admin, id, dto, request.requestId);
  }

  @Post("wallet-top-ups/:id/receipt-link")
  @RequireAdminPermission("wallet.topup.review")
  receiptLink(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() request: AdminAuthedRequest) {
    return this.wallets.receiptLink(admin, id, request.requestId);
  }
}
