import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, SellerSettlementStatus, type SellerSettlementItem } from "@prisma/client";
import type { SellerSettlementDetailDto, SellerSettlementDto, SellerSettlementItemDto } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  InvalidSellerSettlementTransitionException,
  SellerSettlementApprovalRequiredException,
  SellerSettlementNotFoundException,
  SellerSettlementSelfApprovalException,
} from "../../../common/errors/api-exception";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { SellerLedgerService } from "../../seller-finance/seller-ledger.service";
import { SellerFinancialAccountService } from "../../seller-finance/seller-financial-account.service";

const SETTLEMENT_INCLUDE = { initiatedByAdmin: { include: { user: true } }, approvedByAdmin: { include: { user: true } } } as const;
type SettlementWithRelations = Prisma.SellerSettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;

function toItemDto(row: SellerSettlementItem): SellerSettlementItemDto {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    grossAmount: row.grossAmount,
    feeAmount: row.feeAmount,
    netAmount: row.netAmount,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDto(row: SettlementWithRelations): SellerSettlementDto {
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

/** Maps a swept SellerLedgerTransaction's referenceType to the settlement item's sourceType (spec: "no opaque final number"). */
function toSourceType(referenceType: string): string {
  switch (referenceType) {
    case "ORDER_SALE":
      return "ORDER";
    case "ORDER_REFUND":
      return "REFUND";
    case "ADJUSTMENT":
      return "ADJUSTMENT";
    default:
      return referenceType;
  }
}

/**
 * The settlement lifecycle (spec: "Settlement Ready -> Review -> Approve ->
 * Mark/Process Payout -> Reconcile"), built directly on SellerLedgerService's
 * sweep primitives, and living in AdminModule (not SellerFinanceModule)
 * because every mutation here is an admin action requiring AdminAuditLogService
 * — the same layering AdminRefundService already established for H07 refunds.
 * There is no separate "preview" stage — `calculate()` itself performs the
 * real, atomic sweep and lands the settlement in CALCULATED, because that is
 * this schema's first status; a caller who wants a preview should read
 * `SellerLedgerService.getUnsweptTransactions` directly without calling
 * `calculate()`.
 *
 * Idempotency/concurrency (spec Flows D, M): the sweep's `WHERE
 * sellerSettlementId IS NULL` guard (see `sweepTransactions`) is the entire
 * mechanism. Two concurrent `calculate()` calls for the same seller/period
 * both read the same unswept set, but Postgres row-locks each
 * SellerLedgerTransaction row during its `UPDATE`; the loser's sweep
 * matches fewer rows than it asked for, and `calculate()` treats that
 * mismatch as a hard failure — the whole transaction (including the
 * settlement/item rows it just created) rolls back, leaving only the
 * winner's settlement standing.
 */
@Injectable()
export class AdminSellerSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly sellerLedger: SellerLedgerService,
    private readonly sellerAccounts: SellerFinancialAccountService,
  ) {}

  private threshold(): number {
    return this.config.get("SETTLEMENT_APPROVAL_THRESHOLD_IRR", { infer: true });
  }

  async calculate(admin: ResolvedAdminContext, sellerOrganizationId: string, periodStart: Date, periodEnd: Date, requestId?: string): Promise<SellerSettlementDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const account = await this.sellerAccounts.getOrCreate(sellerOrganizationId, tx);
      const unswept = await this.sellerLedger.getUnsweptTransactions(sellerOrganizationId, periodEnd, tx);
      const eligible = unswept.filter((t) => t.createdAt >= periodStart);

      const [refRow] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('seller_settlement_reference_seq') AS nextval`;
      const reference = `STL-${refRow!.nextval.toString().padStart(6, "0")}`;

      let grossIrr = 0;
      let commissionIrr = 0;
      let refundsIrr = 0;
      let adjustmentsIrr = 0;
      let netIrr = 0;
      const itemsData: Prisma.SellerSettlementItemUncheckedCreateWithoutSellerSettlementInput[] = [];

      for (const txn of eligible) {
        const netAmount = txn.entries.reduce((sum, e) => sum + (e.sellerLedgerAccount.code === "RECEIVABLE" ? (e.direction === "DEBIT" ? e.amount : -e.amount) : 0), 0);
        const sourceType = toSourceType(txn.referenceType);

        if (sourceType === "ORDER") {
          const breakdown = await tx.orderFinancialBreakdown.findUnique({ where: { orderId: txn.referenceId } });
          const grossAmount = breakdown?.sellerGrossIrr ?? netAmount;
          const feeAmount = grossAmount - netAmount;
          grossIrr += grossAmount;
          commissionIrr += feeAmount;
          itemsData.push({ sourceType, sourceId: txn.referenceId, grossAmount, feeAmount, netAmount, description: `Order sale — ${txn.referenceId}` });
        } else if (sourceType === "REFUND") {
          const grossAmount = Math.abs(netAmount);
          refundsIrr += grossAmount;
          itemsData.push({ sourceType, sourceId: txn.referenceId, grossAmount, feeAmount: 0, netAmount, description: `Order refund — ${txn.referenceId}` });
        } else {
          adjustmentsIrr += netAmount;
          itemsData.push({ sourceType, sourceId: txn.referenceId, grossAmount: Math.abs(netAmount), feeAmount: 0, netAmount, description: `Seller adjustment — ${txn.referenceId}` });
        }
        netIrr += netAmount;
      }

      const created = await tx.sellerSettlement.create({
        data: {
          reference,
          sellerOrganizationId,
          periodStart,
          periodEnd,
          currency: account.currency,
          status: SellerSettlementStatus.CALCULATED,
          grossIrr,
          commissionIrr,
          refundsIrr,
          adjustmentsIrr,
          netIrr,
          initiatedByAdminId: admin.adminUserId,
          payoutMethodType: account.payoutMethodType,
          items: { create: itemsData },
        },
        include: SETTLEMENT_INCLUDE,
      });

      const sweptCount = await this.sellerLedger.sweepTransactions(
        eligible.map((t) => t.id),
        created.id,
        tx,
      );
      if (sweptCount !== eligible.length) {
        // A concurrent settlement (or a same-second retry) already claimed some of these
        // transactions — never a partial settlement (spec Flow D/M). Rolling back the
        // transaction discards this settlement and its items entirely; the caller should
        // retry `calculate()`, which will see whatever remains genuinely unswept.
        throw new Error(`AdminSellerSettlementService.calculate: expected to sweep ${eligible.length} transactions but swept ${sweptCount} — concurrent settlement detected, rolled back`);
      }

      await this.events.publish("SellerSettlementCalculated", { settlementId: created.id, sellerOrganizationId, netIrr }, { tx, aggregateType: "SellerSettlement", aggregateId: created.id });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "seller_settlement.calculated",
        entityType: "SELLER_SETTLEMENT",
        entityId: created.id,
        afterSummary: { sellerOrganizationId, netIrr, itemCount: itemsData.length },
        requestId,
        tx,
      });
      return created;
    });
    return toDto(row);
  }

  async approve(admin: ResolvedAdminContext, settlementId: string, requestId?: string): Promise<SellerSettlementDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "seller_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      if (!locked) throw new SellerSettlementNotFoundException({ settlementId });

      const existing = await tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (existing.status !== SellerSettlementStatus.CALCULATED) {
        throw new InvalidSellerSettlementTransitionException({ settlementId, from: existing.status, to: SellerSettlementStatus.APPROVED });
      }
      if (existing.initiatedByAdminId === admin.adminUserId) throw new SellerSettlementSelfApprovalException({ settlementId });

      const row = await tx.sellerSettlement.update({
        where: { id: settlementId },
        data: { status: SellerSettlementStatus.APPROVED, approvedByAdminId: admin.adminUserId, approvedAt: new Date() },
        include: SETTLEMENT_INCLUDE,
      });
      await this.events.publish("SellerSettlementApproved", { settlementId }, { tx, aggregateType: "SellerSettlement", aggregateId: settlementId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "seller_settlement.approved", entityType: "SELLER_SETTLEMENT", entityId: settlementId, requestId, tx });
      return row;
    });
    return toDto(updated);
  }

  /** Records that a MANUAL payout actually happened (spec: "never fake bank transfer success") — this never initiates a real transfer itself. */
  async payout(admin: ResolvedAdminContext, settlementId: string, payoutReference: string | undefined, requestId?: string): Promise<SellerSettlementDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "seller_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      if (!locked) throw new SellerSettlementNotFoundException({ settlementId });

      const existing = await tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (existing.status === SellerSettlementStatus.PAID) {
        return tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId }, include: SETTLEMENT_INCLUDE });
      }
      if (existing.netIrr >= this.threshold() && existing.status !== SellerSettlementStatus.APPROVED) {
        throw new SellerSettlementApprovalRequiredException({ settlementId, threshold: this.threshold() });
      }
      if (existing.status !== SellerSettlementStatus.CALCULATED && existing.status !== SellerSettlementStatus.APPROVED) {
        throw new InvalidSellerSettlementTransitionException({ settlementId, from: existing.status, to: SellerSettlementStatus.PAID });
      }

      // A settlement that nets to zero or negative (e.g. refunds fully offset the period's
      // sales) needs no money movement — recorded as PAID for bookkeeping continuity without
      // a SETTLEMENT_PAYMENT posting, since SellerLedgerService.recordBalanced rejects
      // non-positive amounts by design.
      if (existing.netIrr > 0) {
        await this.sellerLedger.recordSettlementPayment(existing.sellerOrganizationId, settlementId, existing.netIrr, existing.currency, tx);
      }

      const row = await tx.sellerSettlement.update({
        where: { id: settlementId },
        data: { status: SellerSettlementStatus.PAID, paidAt: new Date() },
        include: SETTLEMENT_INCLUDE,
      });
      await this.events.publish("SellerSettlementPaid", { settlementId, netIrr: existing.netIrr, payoutReference: payoutReference ?? null }, { tx, aggregateType: "SellerSettlement", aggregateId: settlementId });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "seller_settlement.paid",
        entityType: "SELLER_SETTLEMENT",
        entityId: settlementId,
        afterSummary: { netIrr: existing.netIrr, payoutReference: payoutReference ?? null },
        requestId,
        tx,
      });
      return row;
    });
    return toDto(updated);
  }

  /** Cancels a settlement before any money has moved (spec: "do not allow arbitrary transitions") — un-sweeps its transactions so they are picked up by the next calculation, since no ledger entry needs reversing when nothing was ever paid. */
  async cancel(admin: ResolvedAdminContext, settlementId: string, reason: string, requestId?: string): Promise<SellerSettlementDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "seller_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      if (!locked) throw new SellerSettlementNotFoundException({ settlementId });

      const existing = await tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (existing.status !== SellerSettlementStatus.CALCULATED && existing.status !== SellerSettlementStatus.APPROVED) {
        throw new InvalidSellerSettlementTransitionException({ settlementId, from: existing.status, to: SellerSettlementStatus.CANCELLED });
      }

      await tx.sellerLedgerTransaction.updateMany({ where: { sellerSettlementId: settlementId }, data: { sellerSettlementId: null } });

      const row = await tx.sellerSettlement.update({ where: { id: settlementId }, data: { status: SellerSettlementStatus.CANCELLED, cancelledAt: new Date() }, include: SETTLEMENT_INCLUDE });
      await this.events.publish("SellerSettlementFailed", { settlementId, reason: "CANCELLED" }, { tx, aggregateType: "SellerSettlement", aggregateId: settlementId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "seller_settlement.cancelled", entityType: "SELLER_SETTLEMENT", entityId: settlementId, reason, requestId, tx });
      return row;
    });
    return toDto(updated);
  }

  /** Reverses an already-PAID settlement (spec: "Settlement Reversal" event) — posts a correcting ledger entry rather than rewriting the paid settlement's own history, and the reinstated receivable is picked up by the next calculation. */
  async markFailed(admin: ResolvedAdminContext, settlementId: string, reason: string, requestId?: string): Promise<SellerSettlementDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "seller_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      if (!locked) throw new SellerSettlementNotFoundException({ settlementId });

      const existing = await tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (existing.status !== SellerSettlementStatus.PAID) {
        throw new InvalidSellerSettlementTransitionException({ settlementId, from: existing.status, to: SellerSettlementStatus.FAILED });
      }

      if (existing.netIrr > 0) {
        await this.sellerLedger.recordSettlementReversal(existing.sellerOrganizationId, settlementId, existing.netIrr, existing.currency, tx);
      }

      const row = await tx.sellerSettlement.update({ where: { id: settlementId }, data: { status: SellerSettlementStatus.FAILED }, include: SETTLEMENT_INCLUDE });
      await this.events.publish("SellerSettlementFailed", { settlementId, reason }, { tx, aggregateType: "SellerSettlement", aggregateId: settlementId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "seller_settlement.failed", entityType: "SELLER_SETTLEMENT", entityId: settlementId, reason, requestId, tx });
      return row;
    });
    return toDto(updated);
  }

  async get(settlementId: string): Promise<SellerSettlementDetailDto> {
    const row = await this.prisma.sellerSettlement.findUnique({ where: { id: settlementId }, include: { ...SETTLEMENT_INCLUDE, items: { orderBy: { createdAt: "asc" } } } });
    if (!row) throw new SellerSettlementNotFoundException({ settlementId });
    return { ...toDto(row), items: row.items.map(toItemDto) };
  }

  async list(sellerOrganizationId?: string): Promise<SellerSettlementDto[]> {
    const rows = await this.prisma.sellerSettlement.findMany({ where: sellerOrganizationId ? { sellerOrganizationId } : undefined, include: SETTLEMENT_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toDto);
  }
}
