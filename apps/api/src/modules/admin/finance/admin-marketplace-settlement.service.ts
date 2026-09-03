import { Injectable } from "@nestjs/common";
import { FinancialConfidence, MarketplaceReconciliationStatus, Prisma, type MarketplaceSettlementImportSource } from "@prisma/client";
import type { MarketplaceSettlementReconciliationResultDto, MarketplaceSettlementStatementDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { MarketplaceReconciliationAlreadyResolvedException, MarketplaceReconciliationResultNotFoundException, MarketplaceSettlementStatementNotFoundException } from "../../../common/errors/api-exception";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

const STATEMENT_INCLUDE = { importedByAdmin: { include: { user: true } }, lines: { orderBy: { createdAt: "asc" as const } } } as const;
type StatementWithRelations = Prisma.MarketplaceSettlementStatementGetPayload<{ include: typeof STATEMENT_INCLUDE }>;

const RECONCILIATION_INCLUDE = { resolvedByAdmin: { include: { user: true } } } as const;
type ReconciliationWithRelations = Prisma.MarketplaceReconciliationResultGetPayload<{ include: typeof RECONCILIATION_INCLUDE }>;

function toStatementDto(row: StatementWithRelations): MarketplaceSettlementStatementDto {
  return {
    id: row.id,
    provider: row.provider as unknown as MarketplaceSettlementStatementDto["provider"],
    marketplaceChannelAccountId: row.marketplaceChannelAccountId,
    sellerOrganizationId: row.sellerOrganizationId,
    source: row.source as unknown as MarketplaceSettlementStatementDto["source"],
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    currency: row.currency,
    totalAmount: row.totalAmount,
    importedByAdmin: { id: row.importedByAdmin.id, displayName: row.importedByAdmin.user.displayName, role: row.importedByAdmin.role as unknown as MarketplaceSettlementStatementDto["importedByAdmin"]["role"] },
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((l) => ({
      id: l.id,
      externalOrderId: l.externalOrderId,
      amount: l.amount,
      feeAmount: l.feeAmount,
      feeConfidence: l.feeConfidence as unknown as MarketplaceSettlementStatementDto["lines"][number]["feeConfidence"],
      description: l.description,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

function toReconciliationDto(row: ReconciliationWithRelations): MarketplaceSettlementReconciliationResultDto {
  type ResolvedByAdmin = NonNullable<MarketplaceSettlementReconciliationResultDto["resolvedByAdmin"]>;
  return {
    id: row.id,
    marketplaceSettlementStatementId: row.marketplaceSettlementStatementId,
    marketplaceSettlementStatementLineId: row.marketplaceSettlementStatementLineId,
    marketplaceOrderId: row.marketplaceOrderId,
    status: row.status as unknown as MarketplaceSettlementReconciliationResultDto["status"],
    expectedAmount: row.expectedAmount,
    statementAmount: row.statementAmount,
    variance: row.variance,
    notes: row.notes,
    resolvedByAdmin: row.resolvedByAdmin
      ? ({ id: row.resolvedByAdmin.id, displayName: row.resolvedByAdmin.user.displayName, role: row.resolvedByAdmin.role as unknown as ResolvedByAdmin["role"] } satisfies ResolvedByAdmin)
      : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Marketplace settlement import + reconciliation (spec: "if official
 * settlement APIs are unavailable, build the internal settlement domain
 * and manual/import/reconciliation foundation honestly"). No Torob/Digikala
 * settlement API exists to build a real importer against — `source` is
 * always MANUAL or CSV_IMPORT this phase (see README "External provider
 * status"); a statement is fed in as already-normalized lines regardless of
 * where an admin got them from, so nothing here is CSV-specific.
 *
 * Reconciliation NEVER mutates canonical financial records (spec: "mismatch
 * -> flag -> admin review -> explicit adjustment/correction if needed") —
 * `import()` only ever writes MarketplaceReconciliationResult rows, which
 * are findings; `resolve()` only ever sets its own notes/resolvedAt fields.
 * A correction, if warranted, is a separate, audited AdminSellerAdjustment
 * (see AdminSellerAdjustmentService) — this service has no path to the
 * seller ledger at all.
 */
@Injectable()
export class AdminMarketplaceSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async import(
    admin: ResolvedAdminContext,
    input: {
      marketplaceChannelAccountId: string;
      source: MarketplaceSettlementImportSource;
      periodStart: Date;
      periodEnd: Date;
      currency: string;
      lines: { externalOrderId: string; amount: number; feeAmount?: number; feeConfidence?: FinancialConfidence; description?: string }[];
      rawReference?: Record<string, unknown>;
    },
    requestId?: string,
  ): Promise<MarketplaceSettlementStatementDto> {
    const account = await this.prisma.marketplaceChannelAccount.findUniqueOrThrow({ where: { id: input.marketplaceChannelAccountId } });
    const totalAmount = input.lines.reduce((sum, l) => sum + l.amount, 0);

    let statement: StatementWithRelations;
    try {
      statement = await this.prisma.$transaction(async (tx) => {
        const created = await tx.marketplaceSettlementStatement.create({
          data: {
            provider: account.provider,
            marketplaceChannelAccountId: account.id,
            sellerOrganizationId: account.sellerOrganizationId,
            source: input.source,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            currency: input.currency,
            totalAmount,
            importedByAdminId: admin.adminUserId,
            rawReference: (input.rawReference ?? null) as Prisma.InputJsonValue | undefined,
            lines: {
              create: input.lines.map((l) => ({
                externalOrderId: l.externalOrderId,
                amount: l.amount,
                feeAmount: l.feeAmount ?? null,
                feeConfidence: l.feeConfidence ?? FinancialConfidence.UNKNOWN,
                description: l.description ?? null,
              })),
            },
          },
          include: STATEMENT_INCLUDE,
        });

        await this.reconcile(tx, created);

        await this.events.publish("MarketplaceSettlementImported", { statementId: created.id, sellerOrganizationId: account.sellerOrganizationId, provider: account.provider, lineCount: input.lines.length }, { tx, aggregateType: "MarketplaceSettlementStatement", aggregateId: created.id });
        await this.auditLog.record({
          adminUserId: admin.adminUserId,
          action: "marketplace_settlement.imported",
          entityType: "MARKETPLACE_SETTLEMENT_STATEMENT",
          entityId: created.id,
          afterSummary: { marketplaceChannelAccountId: account.id, periodStart: input.periodStart, periodEnd: input.periodEnd, totalAmount, lineCount: input.lines.length },
          requestId,
          tx,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Same channel account + period already imported (spec Flow I: Duplicate Statement) — a
        // concurrent or retried import converges on the existing statement rather than erroring.
        statement = await this.prisma.marketplaceSettlementStatement.findUniqueOrThrow({
          where: { marketplaceChannelAccountId_periodStart_periodEnd: { marketplaceChannelAccountId: account.id, periodStart: input.periodStart, periodEnd: input.periodEnd } },
          include: STATEMENT_INCLUDE,
        });
        return toStatementDto(statement);
      }
      throw error;
    }
    return toStatementDto(statement);
  }

  /**
   * Compares every line in this statement against internal order economics,
   * then checks the reverse direction — internal marketplace orders in this
   * same period/channel/seller that the statement never mentioned at all
   * (spec: "detect missing order... unknown external order"). Runs inside
   * `import()`'s own transaction so a statement is never left without its
   * reconciliation findings, even momentarily.
   */
  private async reconcile(tx: Prisma.TransactionClient, statement: StatementWithRelations): Promise<void> {
    const coveredExternalOrderIds = new Set<string>();

    for (const line of statement.lines) {
      coveredExternalOrderIds.add(line.externalOrderId);
      const marketplaceOrder = await tx.marketplaceOrder.findUnique({
        where: { provider_marketplaceChannelAccountId_externalOrderId: { provider: statement.provider, marketplaceChannelAccountId: statement.marketplaceChannelAccountId, externalOrderId: line.externalOrderId } },
        include: { reconciliationResults: true },
      });

      if (!marketplaceOrder) {
        await tx.marketplaceReconciliationResult.create({
          data: {
            marketplaceSettlementStatementId: statement.id,
            marketplaceSettlementStatementLineId: line.id,
            status: MarketplaceReconciliationStatus.MISSING_INTERNAL,
            statementAmount: line.amount,
          },
        });
        continue;
      }

      // A prior statement already reported a MATCHED line for this same external order — this
      // one is a re-report of an already-settled order, never legitimately duplicate revenue.
      const alreadyMatched = marketplaceOrder.reconciliationResults.some((r) => r.status === MarketplaceReconciliationStatus.MATCHED && r.marketplaceSettlementStatementLineId !== line.id);
      if (alreadyMatched) {
        await tx.marketplaceReconciliationResult.create({
          data: {
            marketplaceSettlementStatementId: statement.id,
            marketplaceSettlementStatementLineId: line.id,
            marketplaceOrderId: marketplaceOrder.id,
            status: MarketplaceReconciliationStatus.DUPLICATE,
            statementAmount: line.amount,
          },
        });
        continue;
      }

      const breakdown = marketplaceOrder.mappedOrderId ? await tx.orderFinancialBreakdown.findUnique({ where: { orderId: marketplaceOrder.mappedOrderId } }) : null;
      if (!breakdown) {
        await tx.marketplaceReconciliationResult.create({
          data: {
            marketplaceSettlementStatementId: statement.id,
            marketplaceSettlementStatementLineId: line.id,
            marketplaceOrderId: marketplaceOrder.id,
            status: MarketplaceReconciliationStatus.REVIEW_REQUIRED,
            statementAmount: line.amount,
            notes: "Matching MarketplaceOrder has no OrderFinancialBreakdown yet — ingestion may not have completed.",
          },
        });
        continue;
      }

      const expectedAmount = breakdown.grossMerchandiseIrr;
      const variance = line.amount - expectedAmount;
      await tx.marketplaceReconciliationResult.create({
        data: {
          marketplaceSettlementStatementId: statement.id,
          marketplaceSettlementStatementLineId: line.id,
          marketplaceOrderId: marketplaceOrder.id,
          status: variance === 0 ? MarketplaceReconciliationStatus.MATCHED : MarketplaceReconciliationStatus.MISMATCH,
          expectedAmount,
          statementAmount: line.amount,
          variance,
        },
      });
    }

    // Reverse direction: internal marketplace orders for this seller/channel/period the statement never mentioned.
    const internalOrders = await tx.marketplaceOrder.findMany({
      where: { provider: statement.provider, marketplaceChannelAccountId: statement.marketplaceChannelAccountId, placedAt: { gte: statement.periodStart, lt: statement.periodEnd } },
    });
    for (const order of internalOrders) {
      if (coveredExternalOrderIds.has(order.externalOrderId)) continue;
      const breakdown = order.mappedOrderId ? await tx.orderFinancialBreakdown.findUnique({ where: { orderId: order.mappedOrderId } }) : null;
      await tx.marketplaceReconciliationResult.create({
        data: {
          marketplaceSettlementStatementId: statement.id,
          marketplaceOrderId: order.id,
          status: MarketplaceReconciliationStatus.MISSING_EXTERNAL,
          expectedAmount: breakdown?.grossMerchandiseIrr ?? null,
        },
      });
    }
  }

  /** Marks a finding reviewed (spec: "reason required for... reconciliation override") — never touches any financial row. A correction goes through AdminSellerAdjustmentService as a separate, audited action. */
  async resolve(admin: ResolvedAdminContext, reconciliationResultId: string, notes: string, requestId?: string): Promise<MarketplaceSettlementReconciliationResultDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketplaceReconciliationResult.findUnique({ where: { id: reconciliationResultId } });
      if (!existing) throw new MarketplaceReconciliationResultNotFoundException({ reconciliationResultId });
      if (existing.resolvedAt) throw new MarketplaceReconciliationAlreadyResolvedException({ reconciliationResultId });

      const row = await tx.marketplaceReconciliationResult.update({
        where: { id: reconciliationResultId },
        data: { notes, resolvedByAdminId: admin.adminUserId, resolvedAt: new Date() },
        include: RECONCILIATION_INCLUDE,
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "marketplace_reconciliation.resolved", entityType: "MARKETPLACE_RECONCILIATION_RESULT", entityId: reconciliationResultId, reason: notes, requestId, tx });
      return row;
    });
    return toReconciliationDto(updated);
  }

  async listReconciliation(status?: MarketplaceReconciliationStatus): Promise<MarketplaceSettlementReconciliationResultDto[]> {
    const rows = await this.prisma.marketplaceReconciliationResult.findMany({ where: status ? { status } : undefined, include: RECONCILIATION_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toReconciliationDto);
  }

  async getReconciliation(reconciliationResultId: string): Promise<MarketplaceSettlementReconciliationResultDto> {
    const row = await this.prisma.marketplaceReconciliationResult.findUnique({ where: { id: reconciliationResultId }, include: RECONCILIATION_INCLUDE });
    if (!row) throw new MarketplaceReconciliationResultNotFoundException({ reconciliationResultId });
    return toReconciliationDto(row);
  }

  async listStatements(sellerOrganizationId?: string): Promise<MarketplaceSettlementStatementDto[]> {
    const rows = await this.prisma.marketplaceSettlementStatement.findMany({ where: sellerOrganizationId ? { sellerOrganizationId } : undefined, include: STATEMENT_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toStatementDto);
  }

  async getStatement(statementId: string): Promise<MarketplaceSettlementStatementDto> {
    const row = await this.prisma.marketplaceSettlementStatement.findUnique({ where: { id: statementId }, include: STATEMENT_INCLUDE });
    if (!row) throw new MarketplaceSettlementStatementNotFoundException({ statementId });
    return toStatementDto(row);
  }
}
