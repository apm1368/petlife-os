import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PaginatedDto, SellerFinanceSummaryDto, SellerSettlementDetailDto, SellerSettlementDto, SellerTransactionDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SellerSettlementNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";
import type { ResolvedSellerContext } from "../seller-os/auth/seller-context.types";
import { SellerLedgerService } from "./seller-ledger.service";
import { SellerFinancialAccountService, toSellerFinancialAccountDto } from "./seller-financial-account.service";
import { toOrderFinancialBreakdownDto } from "./seller-finance.service";

const SETTLEMENT_INCLUDE = { initiatedByAdmin: { include: { user: true } }, approvedByAdmin: { include: { user: true } } } as const;
type SettlementWithRelations = Prisma.SellerSettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;

function toSettlementDto(row: SettlementWithRelations): SellerSettlementDto {
  return {
    id: row.id,
    reference: row.reference,
    sellerOrganizationId: row.sellerOrganizationId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    currency: row.currency,
    status: row.status as unknown as SellerSettlementDto["status"],
    grossIrr: row.grossIrr,
    commissionIrr: row.commissionIrr,
    refundsIrr: row.refundsIrr,
    adjustmentsIrr: row.adjustmentsIrr,
    netIrr: row.netIrr,
    initiatedByAdmin: { id: row.initiatedByAdmin.id, displayName: row.initiatedByAdmin.user.displayName, role: row.initiatedByAdmin.role as unknown as SellerSettlementDto["initiatedByAdmin"]["role"] },
    approvedByAdmin: row.approvedByAdmin
      ? { id: row.approvedByAdmin.id, displayName: row.approvedByAdmin.user.displayName, role: row.approvedByAdmin.role as unknown as SellerSettlementDto["initiatedByAdmin"]["role"] }
      : null,
    payoutMethodType: row.payoutMethodType,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    reconciledAt: row.reconciledAt ? row.reconciledAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  };
}

/** "ORDER_SALE" -> "ORDER", "ORDER_REFUND" -> "REFUND" — mirrors AdminSellerSettlementService's own referenceType->sourceType mapping; kept as a small local copy rather than a cross-module import, since a seller must never depend on any admin-scoped module. */
function toReferenceLabel(referenceType: string): string {
  switch (referenceType) {
    case "ORDER_SALE":
      return "Order sale";
    case "ORDER_REFUND":
      return "Order refund";
    case "ADJUSTMENT":
      return "Seller adjustment";
    case "SETTLEMENT_PAYMENT":
      return "Settlement payout";
    case "SETTLEMENT_REVERSAL":
      return "Settlement payout reversed";
    default:
      return referenceType;
  }
}

export interface ListSellerTransactionsFilter extends PaginationQueryDto {
  from?: string;
  to?: string;
  settlementStatus?: string;
  orderId?: string;
}

/**
 * Read-only seller-facing finance views (spec: "seller must never see
 * another seller's finances") — every query here is scoped by
 * `ctx.sellerOrganizationId` from the already-authenticated SellerAuthGuard
 * context, never a caller-supplied id, so cross-seller access is
 * structurally impossible rather than merely checked. No mutation lives in
 * this service — settlement/adjustment writes are admin-only
 * (AdminSellerSettlementService/AdminSellerAdjustmentService).
 */
@Injectable()
export class SellerFinanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerLedger: SellerLedgerService,
    private readonly sellerAccounts: SellerFinancialAccountService,
  ) {}

  async getSummary(ctx: ResolvedSellerContext): Promise<SellerFinanceSummaryDto> {
    const [account, balance, lastSettlementRow] = await Promise.all([
      this.sellerAccounts.getOrCreate(ctx.sellerOrganizationId),
      this.sellerLedger.getBalance(ctx.sellerOrganizationId),
      this.prisma.sellerSettlement.findFirst({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, include: SETTLEMENT_INCLUDE, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      account: toSellerFinancialAccountDto(account),
      balance,
      nextSettlementEligibleIrr: balance.pendingIrr,
      lastSettlement: lastSettlementRow ? toSettlementDto(lastSettlementRow) : null,
    };
  }

  async listTransactions(ctx: ResolvedSellerContext, filter: ListSellerTransactionsFilter): Promise<PaginatedDto<SellerTransactionDto>> {
    const { page, pageSize, skip, take } = resolvePagination(filter);
    const where: Prisma.SellerLedgerTransactionWhereInput = {
      sellerOrganizationId: ctx.sellerOrganizationId,
      referenceType: { in: ["ORDER_SALE", "ORDER_REFUND", "ADJUSTMENT"] },
      ...(filter.orderId ? { referenceId: filter.orderId } : {}),
      ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } } : {}),
      ...(filter.settlementStatus === "UNSETTLED" ? { sellerSettlementId: null } : {}),
      ...(filter.settlementStatus && filter.settlementStatus !== "UNSETTLED" ? { sellerSettlement: { status: filter.settlementStatus as never } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sellerLedgerTransaction.findMany({
        where,
        include: { entries: { include: { sellerLedgerAccount: true } }, sellerSettlement: { select: { status: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.sellerLedgerTransaction.count({ where }),
    ]);

    const orderIds = rows.filter((r) => r.referenceType === "ORDER_SALE").map((r) => r.referenceId);
    const breakdowns = orderIds.length > 0 ? await this.prisma.orderFinancialBreakdown.findMany({ where: { orderId: { in: orderIds } } }) : [];
    const breakdownByOrderId = new Map(breakdowns.map((b) => [b.orderId, b]));

    const items: SellerTransactionDto[] = rows.map((row) => {
      const netAmountIrr = row.entries.reduce((sum, e) => sum + (e.sellerLedgerAccount.code === "RECEIVABLE" ? (e.direction === "DEBIT" ? e.amount : -e.amount) : 0), 0);
      const breakdown = breakdownByOrderId.get(row.referenceId);
      return {
        id: row.id,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        description: `${toReferenceLabel(row.referenceType)} — ${row.referenceId}`,
        breakdown: breakdown ? toOrderFinancialBreakdownDto(breakdown) : null,
        netAmountIrr,
        settlementId: row.sellerSettlementId,
        settlementStatus: row.sellerSettlement ? (row.sellerSettlement.status as unknown as SellerTransactionDto["settlementStatus"]) : null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return toPaginatedDto(items, total, page, pageSize);
  }

  async listSettlements(ctx: ResolvedSellerContext): Promise<SellerSettlementDto[]> {
    const rows = await this.prisma.sellerSettlement.findMany({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, include: SETTLEMENT_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toSettlementDto);
  }

  async getSettlement(ctx: ResolvedSellerContext, settlementId: string): Promise<SellerSettlementDetailDto> {
    const row = await this.prisma.sellerSettlement.findUnique({ where: { id: settlementId }, include: { ...SETTLEMENT_INCLUDE, items: { orderBy: { createdAt: "asc" } } } });
    // A settlement belonging to another seller returns NotFound, never Forbidden — never confirm it exists at all (spec: "seller must never see another seller's finances").
    if (!row || row.sellerOrganizationId !== ctx.sellerOrganizationId) throw new SellerSettlementNotFoundException({ settlementId });
    return {
      ...toSettlementDto(row),
      items: row.items.map((i) => ({ id: i.id, sourceType: i.sourceType, sourceId: i.sourceId, grossAmount: i.grossAmount, feeAmount: i.feeAmount, netAmount: i.netAmount, description: i.description, createdAt: i.createdAt.toISOString() })),
    };
  }
}
