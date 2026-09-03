import { Injectable } from "@nestjs/common";
import { LedgerEntryDirection, SellerAdjustmentType, SellerLedgerAccountCode, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

export interface SellerLedgerEntryInput {
  accountCode: SellerLedgerAccountCode;
  direction: LedgerEntryDirection;
  amount: number;
}

/**
 * Per-seller double-entry mirror of LedgerService (see that file's own doc
 * comment) — the one place any SellerLedgerTransaction/SellerLedgerEntry is
 * ever created. Same append-only, balance-or-reject discipline: nothing
 * here ever updates or deletes an existing row, and a seller's balance is
 * always the sum of these entries, never a stored mutable number (spec:
 * "prefer derived balance from ledger/subledger entries").
 *
 * `sellerSettlementId` on SellerLedgerTransaction is this service's own
 * sweep marker (see that model's doc comment) — this service exposes it
 * only as a primitive (`sweepTransactions`/`getUnsweptTransactions`); the
 * decision of exactly when a settlement sweeps (at calculate vs. at pay) is
 * SellerSettlementService's, not this one's.
 */
@Injectable()
export class SellerLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /** Idempotent per-seller chart-of-accounts row — created lazily on first use rather than seeded for every seller up front. */
  async getOrCreateAccount(sellerOrganizationId: string, code: SellerLedgerAccountCode, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const existing = await client.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId, code } } });
    if (existing) return existing.id;
    const created = await client.sellerLedgerAccount.create({ data: { sellerOrganizationId, code, currency } });
    return created.id;
  }

  async recordBalanced(
    sellerOrganizationId: string,
    description: string,
    referenceType: "ORDER_SALE" | "ORDER_REFUND" | "ADJUSTMENT" | "SETTLEMENT_PAYMENT" | "SETTLEMENT_REVERSAL",
    referenceId: string,
    currency: string,
    entries: SellerLedgerEntryInput[],
    client: QueryClient = this.prisma,
    sellerSettlementId?: string,
  ): Promise<string> {
    if (entries.length === 0) throw new Error("SellerLedgerService.recordBalanced called with no entries");
    for (const entry of entries) {
      if (entry.amount <= 0) throw new Error(`SellerLedgerService.recordBalanced: entry amount must be positive, got ${entry.amount}`);
    }
    const debitTotal = entries.filter((e) => e.direction === LedgerEntryDirection.DEBIT).reduce((sum, e) => sum + e.amount, 0);
    const creditTotal = entries.filter((e) => e.direction === LedgerEntryDirection.CREDIT).reduce((sum, e) => sum + e.amount, 0);
    if (debitTotal !== creditTotal) {
      throw new Error(`SellerLedgerService.recordBalanced: unbalanced entries for seller ${sellerOrganizationId} ${referenceType} ${referenceId} (debits=${debitTotal}, credits=${creditTotal})`);
    }

    const accountIds = new Map<SellerLedgerAccountCode, string>();
    for (const entry of entries) {
      if (!accountIds.has(entry.accountCode)) {
        accountIds.set(entry.accountCode, await this.getOrCreateAccount(sellerOrganizationId, entry.accountCode, currency, client));
      }
    }

    const transaction = await client.sellerLedgerTransaction.create({
      data: { sellerOrganizationId, description, referenceType, referenceId, currency, sellerSettlementId: sellerSettlementId ?? null },
    });
    for (const entry of entries) {
      await client.sellerLedgerEntry.create({
        data: {
          sellerLedgerTransactionId: transaction.id,
          sellerLedgerAccountId: accountIds.get(entry.accountCode)!,
          direction: entry.direction,
          amount: entry.amount,
        },
      });
    }

    await this.events.publish(
      "SellerReceivableCreated",
      { sellerLedgerTransactionId: transaction.id, sellerOrganizationId, referenceType, referenceId, amount: debitTotal },
      { aggregateType: "SellerLedgerTransaction", aggregateId: transaction.id },
    );
    return transaction.id;
  }

  /** Marketplace/PET LIFE sale (spec: "Marketplace Sale, PET LIFE OS Sale") — receivable grows by the seller's already-commission-netted amount. */
  async recordSale(sellerOrganizationId: string, orderId: string, sellerNetIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      sellerOrganizationId,
      "Order sale",
      "ORDER_SALE",
      orderId,
      currency,
      [
        { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: sellerNetIrr },
        { accountCode: SellerLedgerAccountCode.SALES_INCOME, direction: LedgerEntryDirection.CREDIT, amount: sellerNetIrr },
      ],
      client,
    );
  }

  /** A refund's seller-side impact (spec: "Refund" event) — reduces receivable by the seller's proportional share of the refunded amount. */
  async recordRefund(sellerOrganizationId: string, refundReferenceId: string, sellerImpactIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      sellerOrganizationId,
      "Order refund",
      "ORDER_REFUND",
      refundReferenceId,
      currency,
      [
        { accountCode: SellerLedgerAccountCode.SALES_INCOME, direction: LedgerEntryDirection.DEBIT, amount: sellerImpactIrr },
        { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.CREDIT, amount: sellerImpactIrr },
      ],
      client,
    );
  }

  /** An admin-created adjustment (spec: "Seller Adjustment" event) — CREDIT increases what the seller is owed, DEBIT decreases it. */
  async recordAdjustment(sellerOrganizationId: string, adjustmentId: string, type: SellerAdjustmentType, amountIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const entries: SellerLedgerEntryInput[] =
      type === SellerAdjustmentType.CREDIT
        ? [
            { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: amountIrr },
            { accountCode: SellerLedgerAccountCode.ADJUSTMENT, direction: LedgerEntryDirection.CREDIT, amount: amountIrr },
          ]
        : [
            { accountCode: SellerLedgerAccountCode.ADJUSTMENT, direction: LedgerEntryDirection.DEBIT, amount: amountIrr },
            { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.CREDIT, amount: amountIrr },
          ];
    return this.recordBalanced(sellerOrganizationId, "Seller adjustment", "ADJUSTMENT", adjustmentId, currency, entries, client);
  }

  /**
   * A recorded payout (spec: "Settlement Payment" event) — clears receivable
   * by what was actually paid. This transaction is created already swept
   * (`sellerSettlementId` set at creation, never later), so it can never be
   * picked up by a future settlement calculation.
   */
  async recordSettlementPayment(sellerOrganizationId: string, sellerSettlementId: string, netIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      sellerOrganizationId,
      "Settlement payout",
      "SETTLEMENT_PAYMENT",
      sellerSettlementId,
      currency,
      [
        { accountCode: SellerLedgerAccountCode.SETTLEMENT_PAID, direction: LedgerEntryDirection.DEBIT, amount: netIrr },
        { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.CREDIT, amount: netIrr },
      ],
      client,
      sellerSettlementId,
    );
  }

  /**
   * Undoes a previously recorded payout after a settlement fails post-payment
   * (spec: "Settlement Reversal" event). Deliberately created *unswept*
   * (`sellerSettlementId` omitted) so the reinstated receivable is picked up
   * by the next settlement calculation — the original sale/refund/adjustment
   * transactions that were swept into the failed settlement are never
   * rewritten (append-only); this is a new, separate correcting entry.
   */
  async recordSettlementReversal(sellerOrganizationId: string, sellerSettlementId: string, netIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      sellerOrganizationId,
      "Settlement payout reversed",
      "SETTLEMENT_REVERSAL",
      sellerSettlementId,
      currency,
      [
        { accountCode: SellerLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: netIrr },
        { accountCode: SellerLedgerAccountCode.SETTLEMENT_PAID, direction: LedgerEntryDirection.CREDIT, amount: netIrr },
      ],
      client,
    );
  }

  /** Derived balance (spec: "do not maintain a mutable balance number") — sum of RECEIVABLE-account entries, split by swept/unswept. */
  async getBalance(sellerOrganizationId: string, client: QueryClient = this.prisma): Promise<{ pendingIrr: number; paidIrr: number }> {
    const account = await client.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId, code: SellerLedgerAccountCode.RECEIVABLE } } });
    const paidAccount = await client.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId, code: SellerLedgerAccountCode.SETTLEMENT_PAID } } });

    const pendingEntries = account
      ? await client.sellerLedgerEntry.findMany({
          where: { sellerLedgerAccountId: account.id, sellerLedgerTransaction: { sellerSettlementId: null } },
          select: { direction: true, amount: true },
        })
      : [];
    const pendingIrr = pendingEntries.reduce((sum, e) => sum + (e.direction === LedgerEntryDirection.DEBIT ? e.amount : -e.amount), 0);

    const paidEntries = paidAccount ? await client.sellerLedgerEntry.findMany({ where: { sellerLedgerAccountId: paidAccount.id }, select: { direction: true, amount: true } }) : [];
    const paidIrr = paidEntries.reduce((sum, e) => sum + (e.direction === LedgerEntryDirection.DEBIT ? e.amount : -e.amount), 0);

    return { pendingIrr, paidIrr };
  }

  /** Every RECEIVABLE-touching transaction not yet swept into a settlement, oldest first — the exact set a settlement calculation may consider. */
  async getUnsweptTransactions(sellerOrganizationId: string, asOf: Date, client: QueryClient = this.prisma) {
    return client.sellerLedgerTransaction.findMany({
      where: { sellerOrganizationId, sellerSettlementId: null, createdAt: { lte: asOf } },
      include: { entries: { include: { sellerLedgerAccount: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Atomically marks a set of transactions as belonging to one settlement —
   * the entire idempotency/double-settlement-protection mechanism (spec:
   * "prevent same order settled twice"). The `WHERE sellerSettlementId IS
   * NULL` guard means a transaction already swept by a concurrent caller is
   * silently excluded from the count; the caller MUST compare the returned
   * count against the number of ids requested and treat a mismatch as a
   * race to recover from (recalculate), never as a partial success to paper over.
   */
  async sweepTransactions(transactionIds: string[], sellerSettlementId: string, client: QueryClient = this.prisma): Promise<number> {
    if (transactionIds.length === 0) return 0;
    const result = await client.sellerLedgerTransaction.updateMany({
      where: { id: { in: transactionIds }, sellerSettlementId: null },
      data: { sellerSettlementId },
    });
    return result.count;
  }
}
