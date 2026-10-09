import { Injectable, Logger } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, BookingPaymentMode, DonationStatus, LedgerAccountCode, LedgerEntryDirection, OrderStatus, PaymentIntentStatus, PaymentStatus, Prisma, ReconciliationCheck, ReconciliationFindingStatus, ReconciliationOutcome, RefundStatus, SellerSettlementStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AutomaticTaskService } from "../task/automatic-task.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { RECON_CHECK_FA, RECON_OUTCOME_FA } from "../task/task-titles";

type Outcome = "MATCHED" | "PENDING" | ReconciliationOutcome;
type Result = { check: ReconciliationCheck; entityType: string; entityId: string; outcome: Outcome; detail: Record<string, unknown> };
const ROW_CAP = 5000;
export const RESOLUTIONS = ["EXPLAINED", "CORRECTED_VIA_WORKFLOW", "DEMO_DATA", "ESCALATED"] as const;

/**
 * ERP-E reconciliation engine. Read-only over money: it compares source-of-truth tables (intents, transactions, the
 * three ledgers, refunds, bookings, orders, donations, settlements), classifies each subject as MATCHED / PENDING /
 * MISMATCH / MISSING / DUPLICATE, persists non-matching subjects as findings (refreshed every run, auto-CLEARED when
 * they stop failing) and raises one FINANCE_MISMATCH task per finding. It never writes to a ledger or a payment row —
 * corrections go through the normal refund/settlement workflows, and a human closes the finding with a resolution.
 */
@Injectable()
export class FinanceReconciliationService {
  private readonly logger = new Logger(FinanceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: AutomaticTaskService,
    private readonly audit: AdminAuditLogService,
  ) {}

  // ------------------------------------------------------------------ checks
  private async intentTransaction(): Promise<Result[]> {
    const intents = await this.prisma.paymentIntent.findMany({ take: ROW_CAP, orderBy: { createdAt: "desc" }, include: { transactions: { where: { type: TransactionType.CHARGE, status: TransactionStatus.SUCCEEDED } } } });
    return intents.map((i) => {
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.INTENT_TRANSACTION, entityType: "PaymentIntent", entityId: i.id, outcome, detail: { intentStatus: i.status, intentAmount: i.amount, ...detail } });
      const charges = i.transactions;
      if (i.status === PaymentIntentStatus.CAPTURED) {
        if (!charges.length) return r(ReconciliationOutcome.MISSING, { expected: "one succeeded CHARGE transaction" });
        if (charges.length > 1) return r(ReconciliationOutcome.DUPLICATE, { succeededCharges: charges.length });
        return charges[0]!.amount === i.amount ? r("MATCHED") : r(ReconciliationOutcome.MISMATCH, { chargeAmount: charges[0]!.amount });
      }
      if ((i.status === PaymentIntentStatus.FAILED || i.status === PaymentIntentStatus.CANCELLED) && charges.length) return r(ReconciliationOutcome.MISMATCH, { reason: "succeeded charge on a non-captured intent" });
      return r(i.status === PaymentIntentStatus.FAILED || i.status === PaymentIntentStatus.CANCELLED ? "MATCHED" : "PENDING");
    });
  }

  /** Ledger reference: the subscription billing attempt for subscription charges, the checkout for everything else. */
  private async transactionLedger(): Promise<Result[]> {
    const intents = await this.prisma.paymentIntent.findMany({ where: { status: PaymentIntentStatus.CAPTURED }, take: ROW_CAP, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, checkoutId: true, subscriptionBillingAttempts: { select: { id: true } } } });
    const refs = intents.map((i) => i.subscriptionBillingAttempts[0]?.id ?? i.checkoutId);
    const ledger = await this.prisma.ledgerTransaction.findMany({ where: { referenceType: "PAYMENT", description: "Payment captured", referenceId: { in: refs } }, include: { entries: { include: { ledgerAccount: { select: { code: true } } } } } });
    return intents.map((i, idx) => {
      const ref = refs[idx]!;
      const txs = ledger.filter((l) => l.referenceId === ref);
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.TRANSACTION_LEDGER, entityType: "PaymentIntent", entityId: i.id, outcome, detail: { ledgerReference: ref, intentAmount: i.amount, ...detail } });
      if (!txs.length) return r(ReconciliationOutcome.MISSING, { expected: "Payment captured ledger posting" });
      if (txs.length > 1) return r(ReconciliationOutcome.DUPLICATE, { postings: txs.length });
      const debited = txs[0]!.entries.filter((e) => e.direction === LedgerEntryDirection.DEBIT && e.ledgerAccount.code === LedgerAccountCode.CASH_GATEWAY_RECEIVABLE).reduce((n, e) => n + e.amount, 0);
      return debited === i.amount ? r("MATCHED") : r(ReconciliationOutcome.MISMATCH, { ledgerAmount: debited });
    });
  }

  private async refundOriginal(): Promise<Result[]> {
    const refunds = await this.prisma.refund.findMany({ take: ROW_CAP, orderBy: { createdAt: "desc" }, include: { paymentIntent: { select: { id: true, status: true, amount: true } } } });
    const succeeded = refunds.filter((r) => r.status === RefundStatus.SUCCEEDED);
    const ledger = await this.prisma.ledgerTransaction.findMany({ where: { referenceType: "REFUND", referenceId: { in: succeeded.map((r) => r.id) } }, include: { entries: true } });
    const refundedPerIntent = new Map<string, number>();
    for (const r of succeeded) if (r.paymentIntentId) refundedPerIntent.set(r.paymentIntentId, (refundedPerIntent.get(r.paymentIntentId) ?? 0) + r.amount);
    return refunds.map((rf) => {
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.REFUND_ORIGINAL, entityType: "Refund", entityId: rf.id, outcome, detail: { refundStatus: rf.status, amount: rf.amount, paymentIntentId: rf.paymentIntentId, ...detail } });
      if (rf.status === RefundStatus.REQUESTED || rf.status === RefundStatus.PROCESSING) return r("PENDING");
      if (rf.status !== RefundStatus.SUCCEEDED) return r("MATCHED");
      if (!rf.paymentIntent) return rf.financingIntentId ? r("MATCHED", { note: "financing refund" }) : r(ReconciliationOutcome.MISSING, { expected: "original payment intent" });
      if (rf.paymentIntent.status !== PaymentIntentStatus.CAPTURED) return r(ReconciliationOutcome.MISMATCH, { reason: "original intent not captured", intentStatus: rf.paymentIntent.status });
      const total = refundedPerIntent.get(rf.paymentIntent.id) ?? 0;
      if (total > rf.paymentIntent.amount) return r(ReconciliationOutcome.MISMATCH, { reason: "refunds exceed captured amount", refundedTotal: total, captured: rf.paymentIntent.amount });
      const posts = ledger.filter((l) => l.referenceId === rf.id);
      if (!posts.length) return r(ReconciliationOutcome.MISSING, { expected: "Refund succeeded ledger posting" });
      if (posts.length > 1) return r(ReconciliationOutcome.DUPLICATE, { postings: posts.length });
      const credited = posts[0]!.entries.filter((e) => e.direction === LedgerEntryDirection.CREDIT).reduce((n, e) => n + e.amount, 0);
      return credited === rf.amount ? r("MATCHED") : r(ReconciliationOutcome.MISMATCH, { ledgerAmount: credited });
    });
  }

  private async bookingCapture(): Promise<Result[]> {
    const bookings = await this.prisma.booking.findMany({ where: { OR: [{ paymentIntentId: { not: null } }, { paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] } }] }, take: ROW_CAP, orderBy: { createdAt: "desc" }, select: { id: true, paymentStatus: true, paymentMode: true, priceAmount: true, depositAmount: true, paymentIntentId: true } });
    const intents = await this.prisma.paymentIntent.findMany({ where: { id: { in: bookings.map((b) => b.paymentIntentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true, amount: true } });
    return bookings.map((b) => {
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.BOOKING_CAPTURE, entityType: "Booking", entityId: b.id, outcome, detail: { paymentStatus: b.paymentStatus, paymentMode: b.paymentMode, ...detail } });
      const intent = intents.find((i) => i.id === b.paymentIntentId);
      if (b.paymentStatus !== PaymentStatus.PAID) return r(b.paymentStatus === PaymentStatus.PENDING || b.paymentStatus === PaymentStatus.AUTHORIZED ? "PENDING" : "MATCHED");
      if (!intent) return r(ReconciliationOutcome.MISSING, { expected: "captured payment intent for a PAID booking" });
      if (intent.status !== PaymentIntentStatus.CAPTURED) return r(ReconciliationOutcome.MISMATCH, { intentStatus: intent.status });
      const expected = Math.round(Number((b.paymentMode === BookingPaymentMode.DEPOSIT ? b.depositAmount : b.priceAmount) ?? 0));
      return expected === intent.amount ? r("MATCHED") : r(ReconciliationOutcome.MISMATCH, { expectedAmount: expected, capturedAmount: intent.amount });
    });
  }

  private async orderCapture(): Promise<Result[]> {
    const orders = await this.prisma.order.findMany({ where: { checkoutId: { not: null } }, take: ROW_CAP, orderBy: { createdAt: "desc" }, select: { id: true, checkoutId: true, status: true, totalAmount: true } });
    const checkoutIds = [...new Set(orders.map((o) => o.checkoutId as string))];
    const intents = await this.prisma.paymentIntent.findMany({ where: { checkoutId: { in: checkoutIds }, status: PaymentIntentStatus.CAPTURED }, select: { checkoutId: true, amount: true } });
    const checkouts = await this.prisma.checkout.findMany({ where: { id: { in: checkoutIds } }, select: { id: true, totalAmount: true } });
    return checkoutIds.map((cid) => {
      const group = orders.filter((o) => o.checkoutId === cid);
      const live = group.filter((o) => o.status !== OrderStatus.PENDING && o.status !== OrderStatus.CANCELLED);
      const captured = intents.filter((i) => i.checkoutId === cid);
      const ordersTotal = group.reduce((n, o) => n + o.totalAmount, 0);
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.ORDER_CAPTURE, entityType: "Checkout", entityId: cid, outcome, detail: { orderIds: group.map((o) => o.id), ordersTotal, ...detail } });
      if (!live.length) return r(group.some((o) => o.status === OrderStatus.PENDING) ? "PENDING" : "MATCHED");
      if (!captured.length) return r(ReconciliationOutcome.MISSING, { expected: "captured payment for confirmed orders" });
      if (captured.length > 1) return r(ReconciliationOutcome.DUPLICATE, { capturedIntents: captured.length });
      const checkoutTotal = checkouts.find((c) => c.id === cid)?.totalAmount;
      return captured[0]!.amount === checkoutTotal ? r("MATCHED") : r(ReconciliationOutcome.MISMATCH, { capturedAmount: captured[0]!.amount, checkoutTotal });
    });
  }

  /** Donation postings reference the DonationTransaction id (DonationLedgerService.recordDonationReceived / recordRefund). */
  private async donationLedger(): Promise<Result[]> {
    const donations = await this.prisma.donationIntent.findMany({ where: { status: { in: [DonationStatus.SUCCEEDED, DonationStatus.REFUNDED] } }, take: ROW_CAP, orderBy: { createdAt: "desc" }, include: { transaction: true } });
    const txIds = donations.map((d) => d.transaction?.id).filter((x): x is string => Boolean(x));
    const posts = await this.prisma.donationLedgerTransaction.findMany({ where: { referenceType: { in: ["DONATION", "DONATION_REFUND"] }, referenceId: { in: txIds } }, include: { entries: true } });
    return donations.map((d) => {
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.DONATION_LEDGER, entityType: "DonationIntent", entityId: d.id, outcome, detail: { status: d.status, amountIrr: d.amountIrr, ...detail } });
      if (!d.transaction) return r(ReconciliationOutcome.MISSING, { expected: "donation transaction" });
      if (d.transaction.amountIrr !== d.amountIrr) return r(ReconciliationOutcome.MISMATCH, { transactionAmount: d.transaction.amountIrr });
      const received = posts.filter((p) => p.referenceType === "DONATION" && p.referenceId === d.transaction!.id);
      if (!received.length) return r(ReconciliationOutcome.MISSING, { expected: "donation ledger posting" });
      if (received.length > 1) return r(ReconciliationOutcome.DUPLICATE, { postings: received.length });
      const credited = received[0]!.entries.filter((e) => e.direction === LedgerEntryDirection.CREDIT).reduce((n, e) => n + e.amount, 0);
      if (credited !== d.amountIrr) return r(ReconciliationOutcome.MISMATCH, { ledgerAmount: credited });
      if (d.status === DonationStatus.REFUNDED && !posts.some((p) => p.referenceType === "DONATION_REFUND" && p.referenceId === d.transaction!.id)) return r(ReconciliationOutcome.MISSING, { expected: "donation refund ledger posting" });
      return r("MATCHED");
    });
  }

  private async settlementLedger(): Promise<Result[]> {
    const settlements = await this.prisma.sellerSettlement.findMany({ take: ROW_CAP, orderBy: { createdAt: "desc" }, include: { items: { select: { grossAmount: true } }, transactions: { select: { id: true, referenceType: true } } } });
    return settlements.map((s) => {
      const r = (outcome: Outcome, detail: Record<string, unknown> = {}): Result => ({ check: ReconciliationCheck.SETTLEMENT_LEDGER, entityType: "SellerSettlement", entityId: s.id, outcome, detail: { status: s.status, reference: s.reference, netIrr: s.netIrr, ...detail } });
      if (s.status === SellerSettlementStatus.CANCELLED) return r("MATCHED");
      const itemsGross = s.items.reduce((n, i) => n + i.grossAmount, 0);
      if (itemsGross !== s.grossIrr) return r(ReconciliationOutcome.MISMATCH, { reason: "items gross differs from settlement gross", itemsGross, grossIrr: s.grossIrr });
      if (s.status !== SellerSettlementStatus.PAID) return r(s.status === SellerSettlementStatus.FAILED || s.status === SellerSettlementStatus.RECONCILIATION_REQUIRED ? ReconciliationOutcome.MISMATCH : "PENDING", s.status === SellerSettlementStatus.FAILED || s.status === SellerSettlementStatus.RECONCILIATION_REQUIRED ? { reason: `settlement ${s.status}` } : {});
      const payments = s.transactions.filter((t) => t.referenceType === "SETTLEMENT_PAYMENT");
      if (s.netIrr <= 0) return r(payments.length ? ReconciliationOutcome.MISMATCH : "MATCHED", payments.length ? { reason: "payment posted for a non-positive settlement" } : {});
      if (!payments.length) return r(ReconciliationOutcome.MISSING, { expected: "SETTLEMENT_PAYMENT seller ledger posting" });
      return payments.length > 1 ? r(ReconciliationOutcome.DUPLICATE, { postings: payments.length }) : r("MATCHED");
    });
  }

  private async ledgerBalance(): Promise<Result[]> {
    const rows = await this.prisma.$queryRaw<{ ledger: string; id: string; diff: bigint }[]>`
      SELECT 'MAIN' AS ledger, "ledgerTransactionId"::text AS id, SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) AS diff FROM ledger_entries GROUP BY 2 HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0
      UNION ALL
      SELECT 'SELLER', "sellerLedgerTransactionId"::text, SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) FROM seller_ledger_entries GROUP BY 2 HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0
      UNION ALL
      SELECT 'DONATION', "donationLedgerTransactionId"::text, SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) FROM donation_ledger_entries GROUP BY 2 HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0`;
    return rows.map((x) => ({ check: ReconciliationCheck.LEDGER_BALANCE, entityType: `${x.ledger}_LEDGER_TRANSACTION`, entityId: x.id, outcome: ReconciliationOutcome.MISMATCH, detail: { ledger: x.ledger, debitMinusCredit: Number(x.diff) } }));
  }

  // ------------------------------------------------------------------ run + findings
  async run(trigger: { adminUserId?: string } = {}) {
    const ranAt = new Date();
    const checks: Record<ReconciliationCheck, () => Promise<Result[]>> = {
      INTENT_TRANSACTION: () => this.intentTransaction(),
      TRANSACTION_LEDGER: () => this.transactionLedger(),
      REFUND_ORIGINAL: () => this.refundOriginal(),
      BOOKING_CAPTURE: () => this.bookingCapture(),
      ORDER_CAPTURE: () => this.orderCapture(),
      DONATION_LEDGER: () => this.donationLedger(),
      SETTLEMENT_LEDGER: () => this.settlementLedger(),
      LEDGER_BALANCE: () => this.ledgerBalance(),
    };
    const summary: Record<string, Record<Outcome, number>> = {};
    let opened = 0;
    let cleared = 0;
    // One run at a time (worker + manual trigger): the advisory lock is held for the whole run.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('finance-reconciliation-run'))`;
      for (const [check, fn] of Object.entries(checks) as [ReconciliationCheck, () => Promise<Result[]>][]) {
        const results = await fn();
        summary[check] = { MATCHED: 0, PENDING: 0, MISMATCH: 0, MISSING: 0, DUPLICATE: 0 };
        const failing = results.filter((r) => r.outcome !== "MATCHED" && r.outcome !== "PENDING");
        for (const r of results) summary[check]![r.outcome]++;
        for (const f of failing) {
          const key = { check_entityType_entityId: { check, entityType: f.entityType, entityId: f.entityId } };
          const existing = await tx.financeReconciliationFinding.findUnique({ where: key });
          if (existing && existing.status === ReconciliationFindingStatus.RESOLVED) {
            await tx.financeReconciliationFinding.update({ where: { id: existing.id }, data: { lastSeenAt: ranAt, outcome: f.outcome as ReconciliationOutcome, detail: f.detail as Prisma.InputJsonValue } });
            continue; // a human already closed it; keep their decision visible, don't reopen silently
          }
          const dedupeKey = `finance-mismatch:${check}:${f.entityId}`;
          await tx.financeReconciliationFinding.upsert({ where: key, create: { check, entityType: f.entityType, entityId: f.entityId, outcome: f.outcome as ReconciliationOutcome, detail: f.detail as Prisma.InputJsonValue, firstDetectedAt: ranAt, lastSeenAt: ranAt, taskDedupeKey: dedupeKey }, update: { status: ReconciliationFindingStatus.OPEN, outcome: f.outcome as ReconciliationOutcome, detail: f.detail as Prisma.InputJsonValue, lastSeenAt: ranAt } });
          if (!existing || existing.status === ReconciliationFindingStatus.CLEARED) opened++;
          await this.tasks.raise({ dedupeKey, title: `${RECON_OUTCOME_FA[f.outcome] ?? f.outcome} مالی: ${RECON_CHECK_FA[check] ?? check}`, description: JSON.stringify(f.detail).slice(0, 1000), source: AdminTaskSource.FINANCE_MISMATCH, team: "FINANCE", priority: check === ReconciliationCheck.LEDGER_BALANCE ? AdminPriority.URGENT : AdminPriority.HIGH, relatedEntityType: f.entityType, relatedEntityId: f.entityId }, tx);
        }
        const stale = await tx.financeReconciliationFinding.updateMany({ where: { check, status: ReconciliationFindingStatus.OPEN, lastSeenAt: { lt: ranAt } }, data: { status: ReconciliationFindingStatus.CLEARED } });
        cleared += stale.count;
      }
    }, { timeout: 120_000 });
    if (trigger.adminUserId) await this.audit.record({ adminUserId: trigger.adminUserId, action: "finance.reconciliation_run", entityType: "FinanceReconciliation", entityId: ranAt.toISOString(), afterSummary: { opened, cleared } });
    this.logger.log(`Reconciliation run: ${opened} opened, ${cleared} cleared`);
    return { ranAt: ranAt.toISOString(), summary, findingsOpened: opened, findingsCleared: cleared };
  }

  async findings(q: { status?: ReconciliationFindingStatus; check?: ReconciliationCheck; entityId?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.FinanceReconciliationFindingWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.check ? { check: q.check } : {}), ...(q.entityId ? { entityId: q.entityId } : {}) };
    const [rows, total, counts] = await Promise.all([
      this.prisma.financeReconciliationFinding.findMany({ where, orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }], skip, take }),
      this.prisma.financeReconciliationFinding.count({ where }),
      this.prisma.financeReconciliationFinding.groupBy({ by: ["status", "check"], _count: { _all: true } }),
    ]);
    const tasks = await this.prisma.adminTask.findMany({ where: { dedupeKey: { in: rows.map((r) => r.taskDedupeKey).filter((x): x is string => Boolean(x)) } }, select: { id: true, dedupeKey: true, status: true, assigneeAdminId: true } });
    return {
      ...toPaginatedDto(rows.map((r) => ({ ...r, firstDetectedAt: r.firstDetectedAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null, task: tasks.find((t) => t.dedupeKey === r.taskDedupeKey) ?? null })), total, page, pageSize),
      counts: counts.map((c) => ({ status: c.status, check: c.check, count: c._count._all })),
    };
  }

  async resolve(admin: ResolvedAdminContext, findingId: string, resolution: string, note: string) {
    if (!(RESOLUTIONS as readonly string[]).includes(resolution)) throw new ValidationApiException({ field: "resolution", reason: "UNKNOWN_RESOLUTION", allowed: RESOLUTIONS });
    return this.prisma.$transaction(async (tx) => {
      const f = await tx.financeReconciliationFinding.findUnique({ where: { id: findingId } });
      if (!f) throw new NotFoundApiException("Reconciliation finding");
      if (f.status !== ReconciliationFindingStatus.OPEN) throw new ValidationApiException({ field: "status", reason: "NOT_OPEN", status: f.status });
      const updated = await tx.financeReconciliationFinding.update({ where: { id: findingId }, data: { status: ReconciliationFindingStatus.RESOLVED, resolution, resolutionNote: note, resolvedAt: new Date(), resolvedByAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "finance.finding_resolved", entityType: f.entityType, entityId: f.entityId, reason: note, afterSummary: { findingId, check: f.check, outcome: f.outcome, resolution }, tx });
      return { id: updated.id, status: updated.status, resolution };
    });
  }
}
