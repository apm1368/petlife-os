import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from "class-validator";
import type { Response } from "express";
import { ReconciliationCheck, ReconciliationFindingStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { FinanceReconciliationService, RESOLUTIONS } from "./finance-reconciliation.service";
import { PaymentTraceService, TRACE_TYPES } from "./payment-trace.service";
import { SettlementOpsService } from "./settlement-ops.service";

class TraceQueryDto {
  @IsIn(TRACE_TYPES as unknown as string[]) type!: string;
  @IsUUID() id!: string;
}
class FindingsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(Object.values(ReconciliationFindingStatus)) status?: ReconciliationFindingStatus;
  @IsOptional() @IsIn(Object.values(ReconciliationCheck)) check?: ReconciliationCheck;
  @IsOptional() @IsString() @Length(1, 64) entityId?: string;
}
class ResolveFindingDto {
  @IsIn(RESOLUTIONS as unknown as string[]) resolution!: string;
  @IsString() @Length(5, 1000) note!: string;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class RefundPreviewDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amount?: number;
}

/** ERP-E finance control plane: trace, reconciliation findings, settlement hold/release/breakdown/export, refund preview. */
@Controller("admin/finance")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminFinanceOpsController {
  constructor(
    private readonly trace: PaymentTraceService,
    private readonly reconciliation: FinanceReconciliationService,
    private readonly settlements: SettlementOpsService,
  ) {}

  @Get("trace")
  @RequireAdminPermission("finance.view")
  traceOf(@CurrentAdmin() admin: ResolvedAdminContext, @Query() q: TraceQueryDto) { return this.trace.trace(admin, q.type, q.id); }

  @Get("reconciliation/findings")
  @RequireAdminPermission("finance.view")
  findings(@Query() q: FindingsQueryDto) { return this.reconciliation.findings(q); }

  @Post("reconciliation/run")
  @RequireAdminPermission("finance.reconcile")
  run(@CurrentAdmin() admin: ResolvedAdminContext) { return this.reconciliation.run({ adminUserId: admin.adminUserId }); }

  @Post("reconciliation/findings/:id/resolve")
  @RequireAdminPermission("finance.reconcile")
  resolve(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ResolveFindingDto) { return this.reconciliation.resolve(admin, id, dto.resolution, dto.note); }

  @Get("settlements/:id/breakdown")
  @RequireAdminPermission("sellerFinance.view")
  breakdown(@Param("id", ParseUUIDPipe) id: string) { return this.settlements.breakdown(id); }

  @Get("settlements/:id/export")
  @RequireAdminPermission("sellerFinance.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.settlements.exportCsv(admin, id);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    return file.content;
  }

  @Post("settlements/:id/hold")
  @RequireAdminPermission("settlement.adjust")
  hold(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.settlements.setHold(admin, id, true, dto.reason); }

  @Post("settlements/:id/release")
  @RequireAdminPermission("settlement.adjust")
  release(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) { return this.settlements.setHold(admin, id, false, dto.reason); }

  @Get("orders/:orderId/refund-preview")
  @RequireAdminPermission("finance.view", "commerce.view")
  refundPreview(@Param("orderId", ParseUUIDPipe) orderId: string, @Query() q: RefundPreviewDto) { return this.settlements.refundPreview(orderId, q.amount); }
}
