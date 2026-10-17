import { Injectable } from "@nestjs/common";
import { OrderStatus, PaymentIntentStatus, RefundStatus, SellerSettlementStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { PlatformSettingsService } from "../../platform-settings/platform-settings.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const HOLDABLE: SellerSettlementStatus[] = [SellerSettlementStatus.CALCULATED, SellerSettlementStatus.APPROVED];
const csv = (v: unknown) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/**
 * ERP-E settlement and refund operations around the existing workflows: hold/release (a held settlement can't be
 * approved or paid — enforced in AdminSellerSettlementService), a settlement breakdown with included items and the
 * period's refund/adjustment postings, CSV export (audited), and a refund preview. Amounts are never edited here.
 * Provider/clinic settlement stays PRODUCT_DECISION_REQUIRED — nothing for it exists.
 */
@Injectable()
export class SettlementOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async setHold(admin: ResolvedAdminContext, settlementId: string, hold: boolean, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "seller_settlements" WHERE "id" = ${settlementId}::uuid FOR UPDATE`;
      if (!locked) throw new NotFoundApiException("Seller settlement");
      const s = await tx.sellerSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (hold && !HOLDABLE.includes(s.status)) throw new ValidationApiException({ field: "status", reason: "NOT_HOLDABLE", status: s.status });
      if (s.onHold === hold) throw new ValidationApiException({ field: "onHold", reason: "UNCHANGED" });
      await tx.sellerSettlement.update({ where: { id: settlementId }, data: hold ? { onHold: true, holdReason: reason, heldAt: new Date(), heldByAdminId: admin.adminUserId } : { onHold: false, holdReason: null, heldAt: null, heldByAdminId: null } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: hold ? "settlement.held" : "settlement.released", entityType: "SELLER_SETTLEMENT", entityId: settlementId, reason, beforeSummary: { onHold: s.onHold }, afterSummary: { onHold: hold }, tx });
      await this.events.publish(hold ? "SellerSettlementHeld" : "SellerSettlementReleased", { settlementId, sellerOrganizationId: s.sellerOrganizationId }, { tx, aggregateType: "SellerSettlement", aggregateId: settlementId });
      return { id: settlementId, onHold: hold };
    });
  }

  async breakdown(settlementId: string) {
    const s = await this.prisma.sellerSettlement.findUnique({ where: { id: settlementId }, include: { items: { orderBy: { createdAt: "asc" } }, sellerOrganization: { select: { id: true, name: true } } } });
    if (!s) throw new NotFoundApiException("Seller settlement");
    const inPeriod = await this.prisma.sellerLedgerTransaction.findMany({ where: { sellerOrganizationId: s.sellerOrganizationId, createdAt: { gte: s.periodStart, lt: s.periodEnd } }, include: { entries: true }, orderBy: { createdAt: "asc" } });
    const includedSources = new Set(s.items.map((i) => i.sourceId));
    const amount = (t: (typeof inPeriod)[number]) => t.entries.filter((e) => e.direction === "CREDIT").reduce((n, e) => n + e.amount, 0);
    return {
      settlement: { id: s.id, reference: s.reference, seller: s.sellerOrganization, status: s.status, periodStart: s.periodStart.toISOString(), periodEnd: s.periodEnd.toISOString(), grossIrr: s.grossIrr, commissionIrr: s.commissionIrr, refundsIrr: s.refundsIrr, adjustmentsIrr: s.adjustmentsIrr, netIrr: s.netIrr, onHold: s.onHold, holdReason: s.holdReason, heldAt: s.heldAt?.toISOString() ?? null },
      included: s.items.map((i) => ({ id: i.id, sourceType: i.sourceType, sourceId: i.sourceId, grossAmount: i.grossAmount, feeAmount: i.feeAmount, netAmount: i.netAmount, description: i.description })),
      refundAdjustments: inPeriod.filter((t) => t.referenceType === "ORDER_REFUND" || t.referenceType === "ADJUSTMENT").map((t) => ({ id: t.id, referenceType: t.referenceType, referenceId: t.referenceId, amount: amount(t), settledIn: t.sellerSettlementId, createdAt: t.createdAt.toISOString() })),
      excludedInPeriod: inPeriod.filter((t) => t.referenceType === "ORDER_SALE" && !includedSources.has(t.referenceId) && t.sellerSettlementId !== s.id).map((t) => ({ id: t.id, referenceType: t.referenceType, referenceId: t.referenceId, amount: amount(t), settledIn: t.sellerSettlementId, createdAt: t.createdAt.toISOString() })),
      clinicSettlement: "PRODUCT_DECISION_REQUIRED",
    };
  }

  async exportCsv(admin: ResolvedAdminContext, settlementId: string) {
    const b = await this.breakdown(settlementId);
    const rows = [["section", "id", "sourceType", "sourceId", "grossAmount", "feeAmount", "netAmount", "description"]];
    for (const i of b.included) rows.push(["INCLUDED", i.id, i.sourceType, i.sourceId, String(i.grossAmount), String(i.feeAmount), String(i.netAmount), i.description]);
    for (const a of b.refundAdjustments) rows.push(["ADJUSTMENT", a.id, a.referenceType, a.referenceId, "", "", String(a.amount), ""]);
    for (const e of b.excludedInPeriod) rows.push(["EXCLUDED", e.id, e.referenceType, e.referenceId, "", "", String(e.amount), e.settledIn ? `settled in ${e.settledIn}` : "not settled"]);
    rows.push(["TOTAL", b.settlement.reference, "", "", String(b.settlement.grossIrr), String(b.settlement.commissionIrr), String(b.settlement.netIrr), `refunds ${b.settlement.refundsIrr}; adjustments ${b.settlement.adjustmentsIrr}`]);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "settlement.exported", entityType: "SELLER_SETTLEMENT", entityId: settlementId, afterSummary: { rows: rows.length - 1 } });
    return { fileName: `settlement-${b.settlement.reference}.csv`, content: `\uFEFF${rows.map((r) => r.map(csv).join(",")).join("\n")}\n` };
  }

  /** What a refund of `amount` on this order would do, before anyone requests it. Nothing is created. */
  async refundPreview(orderId: string, amount?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, totalAmount: true, checkoutId: true } });
    if (!order) throw new NotFoundApiException("Order");
    const intent = order.checkoutId ? await this.prisma.paymentIntent.findFirst({ where: { checkoutId: order.checkoutId, status: PaymentIntentStatus.CAPTURED }, select: { id: true, amount: true } }) : null;
    const refunds = await this.prisma.refund.findMany({ where: { orderId }, select: { id: true, status: true, amount: true } });
    const committed = refunds.filter((r) => r.status === RefundStatus.SUCCEEDED || r.status === RefundStatus.PROCESSING || r.status === RefundStatus.REQUESTED).reduce((n, r) => n + r.amount, 0);
    const refundable = Math.max(0, Math.min(order.totalAmount, intent?.amount ?? 0) - committed);
    const threshold = this.settings.getInt("commerce.refundApprovalThresholdIrr");
    const requested = amount ?? refundable;
    const blockers: string[] = [];
    if (!intent) blockers.push("NO_CAPTURED_PAYMENT");
    if (order.status === OrderStatus.REFUNDED) blockers.push("ALREADY_REFUNDED");
    if (requested <= 0) blockers.push("NOTHING_REFUNDABLE");
    if (requested > refundable) blockers.push("EXCEEDS_REFUNDABLE");
    return { orderId, orderStatus: order.status, orderTotal: order.totalAmount, capturedAmount: intent?.amount ?? 0, alreadyRefundedOrPending: committed, refundable, requestedAmount: requested, requiresSecondApproval: requested >= threshold, approvalThresholdIrr: threshold, canRequest: blockers.length === 0, blockers, existingRefunds: refunds };
  }
}
