import { Body, Controller, Get, Param, Query, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import type { AdminSellerFinanceSummaryDto, MarketplaceReconciliationStatus } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminOrgService } from "../orgs/admin-org.service";
import { SellerLedgerService } from "../../seller-finance/seller-ledger.service";
import { SellerFinancialAccountService, toSellerFinancialAccountDto } from "../../seller-finance/seller-financial-account.service";
import { AdminSellerSettlementService } from "./admin-seller-settlement.service";
import { AdminSellerAdjustmentService } from "./admin-seller-adjustment.service";
import { AdminMarketplaceSettlementService } from "./admin-marketplace-settlement.service";
import { CalculateSellerSettlementDto, ListSellerFinanceQueryDto, PayoutSellerSettlementDto, SellerSettlementReasonDto } from "./dto/admin-seller-settlement.dto";
import { CreateSellerAdjustmentDto } from "./dto/admin-seller-adjustment.dto";
import { ImportMarketplaceSettlementDto, ResolveMarketplaceReconciliationDto } from "./dto/admin-marketplace-settlement.dto";

/**
 * The Handoff 14 admin finance surface — search a seller, inspect
 * balance/settlements, calculate/approve/pay, reconcile marketplace
 * statements, and post controlled adjustments. Every mutating route here
 * requires the specific settlement.* permission it performs (spec: "Admin
 * approval: use H11 Admin RBAC... do NOT give SUPPORT role settlement
 * authority" — SUPPORT never receives any settlement.* permission, see
 * admin-permissions.ts).
 */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSellerFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgs: AdminOrgService,
    private readonly sellerLedger: SellerLedgerService,
    private readonly sellerAccounts: SellerFinancialAccountService,
    private readonly settlements: AdminSellerSettlementService,
    private readonly adjustments: AdminSellerAdjustmentService,
    private readonly marketplaceSettlements: AdminMarketplaceSettlementService,
  ) {}

  private async toSummary(sellerOrganizationId: string): Promise<AdminSellerFinanceSummaryDto> {
    const [sellerOrganization, account, balance] = await Promise.all([
      this.orgs.getSeller(sellerOrganizationId),
      this.sellerAccounts.find(sellerOrganizationId),
      this.sellerLedger.getBalance(sellerOrganizationId),
    ]);
    return { sellerOrganization, account: account ? toSellerFinancialAccountDto(account) : null, balance };
  }

  @Get("seller-finance")
  @RequireAdminPermission("sellerFinance.view")
  async list(@Query() query: ListSellerFinanceQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {};
    const [rows, total] = await Promise.all([this.prisma.sellerOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), this.prisma.sellerOrganization.count({ where })]);
    const summaries = await Promise.all(rows.map((r) => this.toSummary(r.id)));
    return toPaginatedDto(summaries, total, page, pageSize);
  }

  @Get("seller-finance/:sellerId")
  @RequireAdminPermission("sellerFinance.view")
  getSummary(@Param("sellerId") sellerId: string) {
    return this.toSummary(sellerId);
  }

  @Get("settlements")
  @RequireAdminPermission("sellerFinance.view")
  listSettlements(@Query("sellerOrganizationId") sellerOrganizationId: string | undefined) {
    return this.settlements.list(sellerOrganizationId);
  }

  @Get("settlements/:id")
  @RequireAdminPermission("sellerFinance.view")
  getSettlement(@Param("id") id: string) {
    return this.settlements.get(id);
  }

  @Post("settlements/calculate")
  @RequireAdminPermission("settlement.calculate")
  @UseInterceptors(IdempotencyInterceptor)
  calculate(@Body() dto: CalculateSellerSettlementDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.settlements.calculate(admin, dto.sellerOrganizationId, new Date(dto.periodStart), new Date(dto.periodEnd), request.requestId);
  }

  @Post("settlements/:id/approve")
  @RequireAdminPermission("settlement.approve")
  approve(@Param("id") id: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.settlements.approve(admin, id, request.requestId);
  }

  @Post("settlements/:id/payout")
  @RequireAdminPermission("settlement.pay")
  @UseInterceptors(IdempotencyInterceptor)
  payout(@Param("id") id: string, @Body() dto: PayoutSellerSettlementDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.settlements.payout(admin, id, dto.payoutReference, request.requestId);
  }

  @Post("settlements/:id/cancel")
  @RequireAdminPermission("settlement.adjust")
  cancel(@Param("id") id: string, @Body() dto: SellerSettlementReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.settlements.cancel(admin, id, dto.reason, request.requestId);
  }

  @Post("settlements/:id/mark-failed")
  @RequireAdminPermission("settlement.adjust")
  markFailed(@Param("id") id: string, @Body() dto: SellerSettlementReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.settlements.markFailed(admin, id, dto.reason, request.requestId);
  }

  /** Route shape mirrors the spec's literal `/admin/settlements/:id/adjustments` — `:id` only resolves which seller the adjustment posts against (the earlier settlement being reviewed); the adjustment itself is a fresh, unswept ledger transaction picked up by a future settlement, never attached to this one. */
  @Post("settlements/:id/adjustments")
  @RequireAdminPermission("settlement.adjust")
  @UseInterceptors(IdempotencyInterceptor)
  async createAdjustmentFromSettlement(@Param("id") id: string, @Body() dto: CreateSellerAdjustmentDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    const settlement = await this.settlements.get(id);
    return this.adjustments.create(admin, { ...dto, sellerOrganizationId: settlement.sellerOrganizationId }, request.requestId);
  }

  @Post("seller-finance/:sellerId/adjustments")
  @RequireAdminPermission("settlement.adjust")
  @UseInterceptors(IdempotencyInterceptor)
  createAdjustment(@Param("sellerId") sellerId: string, @Body() dto: CreateSellerAdjustmentDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.adjustments.create(admin, { ...dto, sellerOrganizationId: sellerId }, request.requestId);
  }

  @Get("seller-finance/:sellerId/adjustments")
  @RequireAdminPermission("sellerFinance.view")
  listAdjustments(@Param("sellerId") sellerId: string) {
    return this.adjustments.list(sellerId);
  }

  @Post("marketplace-settlements/import")
  @RequireAdminPermission("settlement.calculate")
  @UseInterceptors(IdempotencyInterceptor)
  importMarketplaceSettlement(@Body() dto: ImportMarketplaceSettlementDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.marketplaceSettlements.import(
      admin,
      { marketplaceChannelAccountId: dto.marketplaceChannelAccountId, source: dto.source, periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd), currency: dto.currency, lines: dto.lines },
      request.requestId,
    );
  }

  @Get("marketplace-settlements")
  @RequireAdminPermission("sellerFinance.view")
  listMarketplaceStatements(@Query("sellerOrganizationId") sellerOrganizationId: string | undefined) {
    return this.marketplaceSettlements.listStatements(sellerOrganizationId);
  }

  @Get("marketplace-settlements/:id")
  @RequireAdminPermission("sellerFinance.view")
  getMarketplaceStatement(@Param("id") id: string) {
    return this.marketplaceSettlements.getStatement(id);
  }

  @Get("marketplace-reconciliation")
  @RequireAdminPermission("sellerFinance.view")
  listReconciliation(@Query("status") status: MarketplaceReconciliationStatus | undefined) {
    return this.marketplaceSettlements.listReconciliation(status);
  }

  @Get("marketplace-reconciliation/:id")
  @RequireAdminPermission("sellerFinance.view")
  getReconciliation(@Param("id") id: string) {
    return this.marketplaceSettlements.getReconciliation(id);
  }

  @Post("marketplace-reconciliation/:id/resolve")
  @RequireAdminPermission("settlement.adjust")
  resolveReconciliation(@Param("id") id: string, @Body() dto: ResolveMarketplaceReconciliationDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.marketplaceSettlements.resolve(admin, id, dto.notes, request.requestId);
  }
}
