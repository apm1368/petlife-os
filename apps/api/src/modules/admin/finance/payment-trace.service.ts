import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

export const TRACE_TYPES = ["paymentIntent", "transaction", "refund", "order", "booking", "travelBooking", "checkout", "donation", "subscriptionAttempt"] as const;
export type TraceType = (typeof TRACE_TYPES)[number];
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * ERP-E payment trace: from any money-bearing id, one coherent lifecycle graph — checkout → intents → attempts →
 * transactions → provider events → refunds → main ledger postings (with accounts) → seller ledger / settlement items →
 * donation ledger — plus the reconciliation findings that touch any of it. Read-only; viewing is audited.
 */
@Injectable()
export class PaymentTraceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async rootIntents(type: TraceType, id: string): Promise<{ checkoutIds: string[]; intentIds: string[]; extra: Record<string, unknown> }> {
    const one = <T>(row: T | null, what: string): T => { if (!row) throw new NotFoundApiException(what); return row; };
    switch (type) {
      case "paymentIntent": { const i = one(await this.prisma.paymentIntent.findUnique({ where: { id } }), "Payment intent"); return { checkoutIds: [i.checkoutId], intentIds: [i.id], extra: {} }; }
      case "transaction": { const t = one(await this.prisma.transaction.findUnique({ where: { id }, include: { paymentIntent: true } }), "Transaction"); return { checkoutIds: [t.paymentIntent.checkoutId], intentIds: [t.paymentIntentId], extra: {} }; }
      case "refund": {
        const r = one(await this.prisma.refund.findUnique({ where: { id }, include: { paymentIntent: true, order: true } }), "Refund");
        const checkoutId = r.paymentIntent?.checkoutId ?? r.order?.checkoutId ?? null;
        return { checkoutIds: checkoutId ? [checkoutId] : [], intentIds: r.paymentIntentId ? [r.paymentIntentId] : [], extra: { refundId: r.id } };
      }
      case "order": { const o = one(await this.prisma.order.findUnique({ where: { id } }), "Order"); return { checkoutIds: o.checkoutId ? [o.checkoutId] : [], intentIds: [], extra: { orderId: o.id, marketplaceOrder: !o.checkoutId } }; }
      case "booking": { const b = one(await this.prisma.booking.findUnique({ where: { id }, select: { id: true, paymentIntentId: true } }), "Booking"); return { checkoutIds: [], intentIds: b.paymentIntentId ? [b.paymentIntentId] : [], extra: { bookingId: b.id } }; }
      case "travelBooking": { const b = one(await this.prisma.travelBooking.findUnique({ where: { id }, select: { id: true, paymentIntentId: true } }), "Travel booking"); return { checkoutIds: [], intentIds: b.paymentIntentId ? [b.paymentIntentId] : [], extra: { travelBookingId: b.id } }; }
      case "checkout": { one(await this.prisma.checkout.findUnique({ where: { id } }), "Checkout"); return { checkoutIds: [id], intentIds: [], extra: {} }; }
      case "donation": { const d = one(await this.prisma.donationIntent.findUnique({ where: { id } }), "Donation"); return { checkoutIds: [d.checkoutId], intentIds: [], extra: { donationId: d.id } }; }
      case "subscriptionAttempt": { const a = one(await this.prisma.subscriptionBillingAttempt.findUnique({ where: { id } }), "Billing attempt"); return { checkoutIds: [], intentIds: a.paymentIntentId ? [a.paymentIntentId] : [], extra: { subscriptionAttemptId: a.id } }; }
    }
  }

  async trace(admin: ResolvedAdminContext, type: string, id: string) {
    if (!(TRACE_TYPES as readonly string[]).includes(type)) throw new ValidationApiException({ field: "type", reason: "UNKNOWN_TYPE", allowed: TRACE_TYPES });
    const root = await this.rootIntents(type as TraceType, id);
    const viaIntents = root.intentIds.length ? await this.prisma.paymentIntent.findMany({ where: { id: { in: root.intentIds } }, select: { checkoutId: true } }) : [];
    const checkoutIds = [...new Set([...root.checkoutIds, ...viaIntents.map((i) => i.checkoutId)])];
    const [checkouts, intents] = await Promise.all([
      this.prisma.checkout.findMany({ where: { id: { in: checkoutIds } }, select: { id: true, status: true, totalAmount: true, currency: true, userId: true, createdAt: true } }),
      this.prisma.paymentIntent.findMany({
        where: { OR: [{ checkoutId: { in: checkoutIds } }, { id: { in: root.intentIds } }] },
        orderBy: { createdAt: "asc" },
        include: {
          attempts: { orderBy: { createdAt: "asc" }, select: { id: true, provider: true, status: true, failureCode: true, providerReference: true, createdAt: true, completedAt: true } },
          transactions: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, status: true, amount: true, paymentAttemptId: true, createdAt: true } },
          refunds: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, amount: true, orderId: true, reason: true, requestedByAdminUserId: true, createdAt: true, completedAt: true } },
          providerEvents: { orderBy: { receivedAt: "asc" }, select: { id: true, eventType: true, status: true, receivedAt: true, processedAt: true, attemptCount: true } },
          subscriptionBillingAttempts: { select: { id: true, status: true, amount: true, subscriptionId: true } },
        },
      }),
    ]);
    const intentIds = intents.map((i) => i.id);
    const [orders, bookings, travelBookings, donations, orderRefunds] = await Promise.all([
      this.prisma.order.findMany({ where: { OR: [{ checkoutId: { in: checkoutIds } }, ...(root.extra.orderId ? [{ id: root.extra.orderId as string }] : [])] }, select: { id: true, status: true, totalAmount: true, checkoutId: true, createdAt: true, _count: { select: { items: true } } } }),
      this.prisma.booking.findMany({ where: { OR: [{ paymentIntentId: { in: intentIds } }, ...(root.extra.bookingId ? [{ id: root.extra.bookingId as string }] : [])] }, select: { id: true, bookingStatus: true, paymentStatus: true, paymentMode: true, priceAmount: true, depositAmount: true, paymentIntentId: true } }),
      this.prisma.travelBooking.findMany({ where: { OR: [{ paymentIntentId: { in: intentIds } }, ...(root.extra.travelBookingId ? [{ id: root.extra.travelBookingId as string }] : [])] }, select: { id: true, status: true, paymentIntentId: true } }),
      this.prisma.donationIntent.findMany({ where: { checkoutId: { in: checkoutIds } }, include: { transaction: true } }),
      this.prisma.refund.findMany({ where: { order: { checkoutId: { in: checkoutIds } }, paymentIntentId: null }, select: { id: true, status: true, amount: true, orderId: true, createdAt: true } }),
    ]);
    const refundIds = [...intents.flatMap((i) => i.refunds.map((r) => r.id)), ...orderRefunds.map((r) => r.id)];
    const subAttemptIds = intents.flatMap((i) => i.subscriptionBillingAttempts.map((a) => a.id));
    const orderIds = orders.map((o) => o.id);
    const ledgerRefs = [...checkoutIds, ...refundIds, ...subAttemptIds, ...orderIds];
    const [ledger, sellerLedger, settlementItems, findings] = await Promise.all([
      this.prisma.ledgerTransaction.findMany({ where: { referenceId: { in: ledgerRefs } }, orderBy: { createdAt: "asc" }, include: { entries: { include: { ledgerAccount: { select: { code: true } } } } } }),
      this.prisma.sellerLedgerTransaction.findMany({ where: { referenceId: { in: [...orderIds, ...refundIds] } }, orderBy: { createdAt: "asc" }, include: { entries: true, sellerSettlement: { select: { id: true, reference: true, status: true } } } }),
      this.prisma.sellerSettlementItem.findMany({ where: { sourceId: { in: [...orderIds, ...refundIds] } }, include: { sellerSettlement: { select: { id: true, reference: true, status: true, onHold: true } } } }),
      this.prisma.financeReconciliationFinding.findMany({ where: { entityId: { in: [...checkoutIds, ...intentIds, ...refundIds, ...orderIds, ...bookings.map((b) => b.id), ...donations.map((d) => d.id)] } } }),
    ]);
    const donationLedgerIds = donations.map((d) => d.transaction?.donationLedgerTransactionId).filter((x): x is string => Boolean(x));
    const donationLedger = donationLedgerIds.length ? await this.prisma.donationLedgerTransaction.findMany({ where: { id: { in: donationLedgerIds } }, include: { entries: true } }) : [];
    await this.audit.record({ adminUserId: admin.adminUserId, action: "finance.trace_viewed", entityType: type, entityId: id });
    const sumBy = (entries: { direction: string; amount: number }[], dir: string) => entries.filter((e) => e.direction === dir).reduce((n, e) => n + e.amount, 0);
    return {
      root: { type, id },
      checkouts: checkouts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      intents: intents.map((i) => ({
        id: i.id, checkoutId: i.checkoutId, status: i.status, provider: i.provider, amount: i.amount, currency: i.currency, createdAt: i.createdAt.toISOString(),
        attempts: i.attempts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), completedAt: iso(a.completedAt) })),
        transactions: i.transactions.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
        providerEvents: i.providerEvents.map((e) => ({ ...e, receivedAt: e.receivedAt.toISOString(), processedAt: iso(e.processedAt) })),
        refunds: i.refunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
        subscriptionAttempts: i.subscriptionBillingAttempts,
      })),
      orders: orders.map((o) => ({ id: o.id, status: o.status, totalAmount: o.totalAmount, checkoutId: o.checkoutId, itemCount: o._count.items, createdAt: o.createdAt.toISOString() })),
      orderRefundsWithoutIntent: orderRefunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      bookings: bookings.map((b) => ({ ...b, priceAmount: b.priceAmount?.toString() ?? null, depositAmount: b.depositAmount?.toString() ?? null })),
      travelBookings,
      donations: donations.map((d) => ({ id: d.id, status: d.status, amountIrr: d.amountIrr, campaignId: d.campaignId, transactionId: d.transaction?.id ?? null, refundedAt: iso(d.transaction?.refundedAt) })),
      ledger: ledger.map((l) => ({ id: l.id, description: l.description, referenceType: l.referenceType, referenceId: l.referenceId, createdAt: l.createdAt.toISOString(), balanced: sumBy(l.entries, "DEBIT") === sumBy(l.entries, "CREDIT"), entries: l.entries.map((e) => ({ account: e.ledgerAccount.code, direction: e.direction, amount: e.amount })) })),
      sellerLedger: sellerLedger.map((l) => ({ id: l.id, sellerOrganizationId: l.sellerOrganizationId, description: l.description, referenceType: l.referenceType, referenceId: l.referenceId, settlement: l.sellerSettlement, balanced: sumBy(l.entries, "DEBIT") === sumBy(l.entries, "CREDIT"), createdAt: l.createdAt.toISOString() })),
      settlementItems: settlementItems.map((s) => ({ id: s.id, sourceType: s.sourceType, sourceId: s.sourceId, grossAmount: s.grossAmount, feeAmount: s.feeAmount, netAmount: s.netAmount, settlement: s.sellerSettlement })),
      donationLedger: donationLedger.map((l) => ({ id: l.id, referenceType: l.referenceType, referenceId: l.referenceId, balanced: sumBy(l.entries, "DEBIT") === sumBy(l.entries, "CREDIT") })),
      reconciliationFindings: findings.map((f) => ({ id: f.id, check: f.check, entityType: f.entityType, entityId: f.entityId, outcome: f.outcome, status: f.status, lastSeenAt: f.lastSeenAt.toISOString() })),
    };
  }
}
