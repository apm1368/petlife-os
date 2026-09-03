import { Injectable } from "@nestjs/common";
import { Prisma, type SellerAdjustmentReasonCode, type SellerAdjustmentType } from "@prisma/client";
import type { SellerAdjustmentDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { SellerAdjustmentNotFoundException } from "../../../common/errors/api-exception";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { SellerLedgerService } from "../../seller-finance/seller-ledger.service";
import { SellerFinancialAccountService } from "../../seller-finance/seller-financial-account.service";

const ADJUSTMENT_INCLUDE = { createdByAdmin: { include: { user: true } } } as const;
type AdjustmentWithRelations = Prisma.SellerAdjustmentGetPayload<{ include: typeof ADJUSTMENT_INCLUDE }>;

function toDto(row: AdjustmentWithRelations): SellerAdjustmentDto {
  return {
    id: row.id,
    sellerOrganizationId: row.sellerOrganizationId,
    type: row.type as unknown as SellerAdjustmentDto["type"],
    reasonCode: row.reasonCode as unknown as SellerAdjustmentDto["reasonCode"],
    amountIrr: row.amountIrr,
    reason: row.reason,
    evidenceReference: row.evidenceReference,
    createdByAdmin: { id: row.createdByAdmin.id, displayName: row.createdByAdmin.user.displayName, role: row.createdByAdmin.role as unknown as SellerAdjustmentDto["createdByAdmin"]["role"] },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Explicit, ledger-backed seller balance corrections (spec: "no arbitrary
 * balance editing... every adjustment requires amount, reason, actor,
 * evidence/reference, audit, ledger posting"). Posts immediately on
 * creation as an unswept SellerLedgerTransaction — it is picked up by the
 * next settlement calculation exactly like an order sale or refund, never
 * requiring a settlement to already exist.
 */
@Injectable()
export class AdminSellerAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
    private readonly sellerLedger: SellerLedgerService,
    private readonly sellerAccounts: SellerFinancialAccountService,
  ) {}

  async create(
    admin: ResolvedAdminContext,
    input: { sellerOrganizationId: string; type: SellerAdjustmentType; reasonCode: SellerAdjustmentReasonCode; amountIrr: number; reason: string; evidenceReference?: string },
    requestId?: string,
  ): Promise<SellerAdjustmentDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const account = await this.sellerAccounts.getOrCreate(input.sellerOrganizationId, tx);
      const created = await tx.sellerAdjustment.create({
        data: {
          sellerOrganizationId: input.sellerOrganizationId,
          type: input.type,
          reasonCode: input.reasonCode,
          amountIrr: input.amountIrr,
          reason: input.reason,
          evidenceReference: input.evidenceReference ?? null,
          createdByAdminId: admin.adminUserId,
        },
        include: ADJUSTMENT_INCLUDE,
      });

      await this.sellerLedger.recordAdjustment(input.sellerOrganizationId, created.id, input.type, input.amountIrr, account.currency, tx);

      await this.events.publish(
        "SellerReceivableAdjusted",
        { adjustmentId: created.id, sellerOrganizationId: input.sellerOrganizationId, type: input.type, amountIrr: input.amountIrr },
        { tx, aggregateType: "SellerAdjustment", aggregateId: created.id },
      );
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "seller_adjustment.created",
        entityType: "SELLER_ADJUSTMENT",
        entityId: created.id,
        reason: input.reason,
        afterSummary: { sellerOrganizationId: input.sellerOrganizationId, type: input.type, reasonCode: input.reasonCode, amountIrr: input.amountIrr },
        requestId,
        tx,
      });
      return created;
    });
    return toDto(row);
  }

  async list(sellerOrganizationId?: string): Promise<SellerAdjustmentDto[]> {
    const rows = await this.prisma.sellerAdjustment.findMany({ where: sellerOrganizationId ? { sellerOrganizationId } : undefined, include: ADJUSTMENT_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toDto);
  }

  async get(adjustmentId: string): Promise<SellerAdjustmentDto> {
    const row = await this.prisma.sellerAdjustment.findUnique({ where: { id: adjustmentId }, include: ADJUSTMENT_INCLUDE });
    if (!row) throw new SellerAdjustmentNotFoundException({ adjustmentId });
    return toDto(row);
  }
}
