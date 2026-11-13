import { Controller, Get, Header, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import type { Response } from "express";
import type { AdminTransactionKind, AdminTransactionPageDto } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { TRANSACTION_GATEWAYS, TRANSACTION_KINDS, TransactionsExplorerService } from "./transactions-explorer.service";

class TransactionsQueryDto {
  @IsOptional() @IsIn(TRANSACTION_KINDS as unknown as string[]) kind?: AdminTransactionKind;
  @IsOptional() @IsString() @Length(1, 120) person?: string;
  @IsOptional() @IsString() @Length(1, 120) product?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000_000) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000_000) maxAmount?: number;
  @IsOptional() @IsIn(TRANSACTION_GATEWAYS as unknown as string[]) gateway?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z_]{2,40}$/) status?: string;
  @IsOptional() @IsString() @Length(1, 200) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/**
 * Admin → Transactions → Explorer. Listing needs finance.view; exporting the same filtered list as CSV needs
 * finance.manage. Both are read-only; a search naming a person and every export are audited.
 */
@Controller("admin/finance/transactions")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTransactionsExplorerController {
  constructor(private readonly explorer: TransactionsExplorerService) {}

  @Get()
  @RequireAdminPermission("finance.view")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: TransactionsQueryDto, @Req() request: AdminAuthedRequest): Promise<AdminTransactionPageDto> {
    return this.explorer.list(admin, query, request.requestId);
  }

  @Get("export")
  @RequireAdminPermission("finance.manage")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async export(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: TransactionsQueryDto, @Req() request: AdminAuthedRequest, @Res({ passthrough: true }) res: Response) {
    const file = await this.explorer.exportCsv(admin, query, request.requestId);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.setHeader("X-Export-Rows", String(file.rows));
    res.setHeader("X-Export-Truncated", file.truncated ? "1" : "0");
    return file.content;
  }
}
