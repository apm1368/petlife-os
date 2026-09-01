import { Injectable, OnModuleInit } from "@nestjs/common";
import { LedgerAccountCode, LedgerEntryDirection, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

export interface LedgerEntryInput {
  accountCode: LedgerAccountCode;
  direction: LedgerEntryDirection;
  amount: number;
}

const SEEDED_ACCOUNTS: { code: LedgerAccountCode; name: string }[] = [
  { code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE, name: "Cash / Gateway Receivable" },
  { code: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, name: "Customer Payment Clearing" },
  { code: LedgerAccountCode.SELLER_PAYABLE, name: "Seller Payable" },
  { code: LedgerAccountCode.REFUND_PAYABLE, name: "Refund Payable" },
  { code: LedgerAccountCode.PLATFORM_REVENUE, name: "Platform Revenue" },
];

/**
 * Double-entry ledger foundation (spec sections 30-34) — the one place any
 * LedgerTransaction/LedgerEntry is ever created. `recordBalanced` is the
 * enforcement point for "sum(debits) = sum(credits)": a multi-row invariant
 * across sibling LedgerEntry rows that a single-row database CHECK cannot
 * express (see the schema doc comment), so it is verified here, before any
 * row is written, and the whole transaction is rejected if it doesn't
 * balance — never partially written.
 *
 * Ledger rows are append-only (spec section 34): nothing in this service
 * ever updates or deletes an existing LedgerEntry/LedgerTransaction. A
 * refund is a new, separate LedgerTransaction with its own reversing
 * entries, never an edit to the original payment's entries.
 */
@Injectable()
export class LedgerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /** Idempotent seed of the small, fixed chart of accounts (spec section 31) — safe to run on every boot. */
  async onModuleInit(): Promise<void> {
    for (const account of SEEDED_ACCOUNTS) {
      await this.prisma.ledgerAccount.upsert({
        where: { code: account.code },
        update: {},
        create: { code: account.code, name: account.name },
      });
    }
  }

  async recordBalanced(
    description: string,
    referenceType: "PAYMENT" | "REFUND",
    referenceId: string,
    currency: string,
    entries: LedgerEntryInput[],
    client: QueryClient = this.prisma,
  ): Promise<string> {
    if (entries.length === 0) throw new Error("LedgerService.recordBalanced called with no entries");
    for (const entry of entries) {
      if (entry.amount <= 0) throw new Error(`LedgerService.recordBalanced: entry amount must be positive, got ${entry.amount}`);
    }
    const debitTotal = entries.filter((e) => e.direction === LedgerEntryDirection.DEBIT).reduce((sum, e) => sum + e.amount, 0);
    const creditTotal = entries.filter((e) => e.direction === LedgerEntryDirection.CREDIT).reduce((sum, e) => sum + e.amount, 0);
    if (debitTotal !== creditTotal) {
      throw new Error(`LedgerService.recordBalanced: unbalanced entries for ${referenceType} ${referenceId} (debits=${debitTotal}, credits=${creditTotal})`);
    }

    const accounts = await client.ledgerAccount.findMany({ where: { code: { in: entries.map((e) => e.accountCode) } } });
    const accountByCode = new Map(accounts.map((a) => [a.code, a.id]));

    const transaction = await client.ledgerTransaction.create({
      data: { description, referenceType, referenceId, currency },
    });
    for (const entry of entries) {
      const accountId = accountByCode.get(entry.accountCode);
      if (!accountId) throw new Error(`LedgerService.recordBalanced: unknown ledger account ${entry.accountCode}`);
      await client.ledgerEntry.create({
        data: { ledgerTransactionId: transaction.id, ledgerAccountId: accountId, direction: entry.direction, amount: entry.amount },
      });
    }

    await this.events.publish(
      "FinancialLedgerTransactionCreated",
      { ledgerTransactionId: transaction.id, referenceType, referenceId, amount: debitTotal },
      { aggregateType: "LedgerTransaction", aggregateId: transaction.id },
    );
    return transaction.id;
  }

  /**
   * A successful payment (standard or approved BNPL) records the gateway
   * receiving cash on our behalf against a conservative clearing liability
   * (spec section 32) — no seller settlement exists yet, so nothing posts
   * to SELLER_PAYABLE or PLATFORM_REVENUE this phase; those accounts are
   * seeded placeholders only (see README "Ledger accounts").
   */
  async recordPaymentSucceeded(referenceId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Payment captured",
      "PAYMENT",
      referenceId,
      currency,
      [
        { accountCode: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }

  /** A refund reverses the original payment's entries exactly (spec section 33) — a new transaction, never an edit to the original. */
  async recordRefundSucceeded(referenceId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Refund succeeded",
      "REFUND",
      referenceId,
      currency,
      [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }
}
