import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { WalletAdjustmentRequestStatus, WalletBalanceType, WalletOwnerType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from "class-validator";
import { WALLET_TRANSFER_REASON_CODES, type AdminWalletAccountDetailDto, type AdminWalletAccountDto, type AdminWalletTransferDto, type PaginatedDto, type WalletTransferReasonCode } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminWalletTransfersService } from "./admin-wallet-transfers.service";

class ListAccountsQueryDto {
  @IsIn(Object.values(WalletOwnerType)) type!: WalletOwnerType;
  @IsOptional() @IsString() @Length(1, 120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

class ListTransfersQueryDto {
  @IsOptional() @IsIn(Object.values(WalletAdjustmentRequestStatus)) status?: WalletAdjustmentRequestStatus;
  @IsOptional() @IsUUID() walletAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class OwnerRefDto {
  @IsIn(Object.values(WalletOwnerType)) type!: WalletOwnerType;
  @IsUUID() id!: string;
}

class RequestTransferDto {
  @ValidateNested() @Type(() => OwnerRefDto) from!: OwnerRefDto;
  @ValidateNested() @Type(() => OwnerRefDto) to!: OwnerRefDto;
  @IsIn(Object.values(WalletBalanceType)) balanceType!: WalletBalanceType;
  @IsInt() @Min(1) amount!: number;
  @IsIn(WALLET_TRANSFER_REASON_CODES as unknown as string[]) reasonCode!: WalletTransferReasonCode;
  @IsString() @Length(5, 1000) note!: string;
  @IsString() @Length(3, 300) evidenceReference!: string;
}

class RejectTransferDto {
  @IsString() @Length(5, 500) reason!: string;
}

class ReverseTransferDto {
  @IsString() @Length(5, 1000) note!: string;
  @IsString() @Length(3, 300) evidenceReference!: string;
}

/**
 * Wallets of every kind (member, seller organisation, provider organisation) and two-person staff transfers between
 * them (FE-16). Reading needs wallet.view; requesting, approving, rejecting or reversing a transfer needs wallet.adjust,
 * and approval must come from a different admin than the requester.
 */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminWalletTransfersController {
  constructor(private readonly transfers: AdminWalletTransfersService) {}

  @Get("wallet-accounts")
  @RequireAdminPermission("wallet.view")
  accounts(@Query() query: ListAccountsQueryDto): Promise<PaginatedDto<AdminWalletAccountDto>> {
    return this.transfers.listAccounts({ type: query.type, q: query.q, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Get("wallet-accounts/:id")
  @RequireAdminPermission("wallet.view")
  account(@Param("id", ParseUUIDPipe) id: string): Promise<AdminWalletAccountDetailDto> {
    return this.transfers.accountDetail(id);
  }

  @Get("wallet-transfers")
  @RequireAdminPermission("wallet.view")
  list(@Query() query: ListTransfersQueryDto): Promise<PaginatedDto<AdminWalletTransferDto>> {
    return this.transfers.list({ status: query.status, walletAccountId: query.walletAccountId, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Get("wallet-transfers/:id")
  @RequireAdminPermission("wallet.view")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<AdminWalletTransferDto> {
    return this.transfers.get(id);
  }

  @Post("wallet-transfers")
  @RequireAdminPermission("wallet.adjust")
  request(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: RequestTransferDto, @Req() req: AdminAuthedRequest, @Headers("idempotency-key") idempotencyKey?: string): Promise<AdminWalletTransferDto> {
    return this.transfers.request(admin, dto, idempotencyKey, req.requestId);
  }

  @Post("wallet-transfers/:id/approve")
  @RequireAdminPermission("wallet.adjust")
  approve(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() req: AdminAuthedRequest): Promise<AdminWalletTransferDto> {
    return this.transfers.approve(admin, id, req.requestId);
  }

  @Post("wallet-transfers/:id/reject")
  @RequireAdminPermission("wallet.adjust")
  reject(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RejectTransferDto, @Req() req: AdminAuthedRequest): Promise<AdminWalletTransferDto> {
    return this.transfers.reject(admin, id, dto.reason, req.requestId);
  }

  @Post("wallet-transfers/:id/reverse")
  @RequireAdminPermission("wallet.adjust")
  reverse(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReverseTransferDto, @Req() req: AdminAuthedRequest): Promise<AdminWalletTransferDto> {
    return this.transfers.reverse(admin, id, dto, req.requestId);
  }
}
