import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { WalletTopUpRail } from "@prisma/client";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import type { BusinessWalletDto, WalletEntryPageDto, WalletSummaryDto, WalletTopUpDto, WalletTopUpStartedDto } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { WalletService } from "./wallet.service";
import { WalletTopUpService } from "./wallet-top-up.service";
import { BusinessWalletService } from "./business-wallet.service";

class WalletHistoryQueryDto {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

class StartTopUpDto {
  @IsInt() @Min(1) amount!: number;
  @IsIn(Object.values(WalletTopUpRail)) rail!: WalletTopUpRail;
  @IsOptional() @IsIn(["fa", "en", "de", "es", "ar", "nl"]) locale?: string;
}

class ReceiptUploadTargetDto {
  @IsString() @Length(3, 60) contentType!: string;
  @IsInt() @Min(1) fileSizeBytes!: number;
}

class SubmitReceiptDto {
  @IsString() @Length(10, 300) objectKey!: string;
}

class VerifyZibalDto {
  @IsString() @Length(1, 64) trackId!: string;
}

/**
 * The signed-in member's own wallet (balance, history, top-ups), and the business wallets of organisations they manage
 * (/wallet/business, /wallet/accounts/:id — 404 unless they manage it). Nothing here can move another member's money.
 */
@Controller("wallet")
@UseGuards(SessionAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService, private readonly topUps: WalletTopUpService, private readonly business: BusinessWalletService) {}

  @Get("business")
  businessWallets(@CurrentUser() user: SessionUser): Promise<BusinessWalletDto[]> {
    return this.business.listMine(user.id);
  }

  @Get("accounts/:accountId")
  accountSummary(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string): Promise<WalletSummaryDto> {
    return this.business.summary(user.id, accountId);
  }

  @Get("accounts/:accountId/entries")
  accountEntries(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Query() query: WalletHistoryQueryDto): Promise<WalletEntryPageDto> {
    return this.business.entries(user.id, accountId, query);
  }

  @Get("accounts/:accountId/top-ups")
  accountTopUps(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string): Promise<WalletTopUpDto[]> {
    return this.business.listTopUps(user.id, accountId);
  }

  @Post("accounts/:accountId/top-ups")
  startAccountTopUp(@CurrentUser() user: SessionUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Body() dto: StartTopUpDto, @Headers("idempotency-key") idempotencyKey?: string): Promise<WalletTopUpStartedDto> {
    return this.business.startTopUp(user.id, accountId, { amount: dto.amount, rail: dto.rail, locale: dto.locale ?? "fa" }, idempotencyKey);
  }

  @Get()
  async summary(@CurrentUser() user: SessionUser): Promise<WalletSummaryDto> {
    const { balances, expiringSoon } = await this.wallet.summary(user.id);
    return { balances, expiringSoon, topUp: await this.topUps.options() };
  }

  @Get("entries")
  entries(@CurrentUser() user: SessionUser, @Query() query: WalletHistoryQueryDto): Promise<WalletEntryPageDto> {
    return this.wallet.history(user.id, query);
  }

  @Get("top-ups")
  listTopUps(@CurrentUser() user: SessionUser): Promise<WalletTopUpDto[]> {
    return this.topUps.list(user.id);
  }

  @Post("top-ups")
  startTopUp(@CurrentUser() user: SessionUser, @Body() dto: StartTopUpDto, @Headers("idempotency-key") idempotencyKey?: string): Promise<WalletTopUpStartedDto> {
    return this.topUps.start(user.id, { amount: dto.amount, rail: dto.rail, locale: dto.locale ?? "fa" }, idempotencyKey);
  }

  @Post("top-ups/zibal/verify")
  verifyZibal(@CurrentUser() user: SessionUser, @Body() dto: VerifyZibalDto): Promise<WalletTopUpDto> {
    return this.topUps.verifyZibal(user.id, dto.trackId);
  }

  @Get("top-ups/:id")
  getTopUp(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<WalletTopUpStartedDto> {
    return this.topUps.get(user.id, id);
  }

  @Post("top-ups/:id/receipt-upload")
  receiptUploadTarget(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReceiptUploadTargetDto) {
    return this.topUps.receiptUploadTarget(user.id, id, dto.contentType, dto.fileSizeBytes);
  }

  @Post("top-ups/:id/receipt")
  submitReceipt(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SubmitReceiptDto): Promise<WalletTopUpDto> {
    return this.topUps.submitReceipt(user.id, id, dto.objectKey);
  }

  @Post("top-ups/:id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<WalletTopUpDto> {
    return this.topUps.cancel(user.id, id);
  }
}
