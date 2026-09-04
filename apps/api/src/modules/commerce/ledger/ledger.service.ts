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
  { code: LedgerAccountCode.MARKETPLACE_RECEIVABLE, name: "Marketplace Receivable" },
  { code: LedgerAccountCode.DONATION_PAYABLE, name: "Donation Payable" },
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

  /**
   * Closes the financial loop H07 deliberately left open (Handoff 14): the
   * customer cash already sitting in CUSTOMER_PAYMENT_CLEARING is now
   * actually distributed between what the seller is owed and what the
   * platform earned, finally posting to the two accounts H07 only ever
   * seeded (spec: "Order Financial Attribution -> Platform Fees -> Seller
   * Receivable"). Only for PET_LIFE-origin orders — PET LIFE OS actually
   * held this cash, so a debit against CLEARING is honest here in a way it
   * would not be for a marketplace-collected sale (see
   * `recordMarketplaceCommission`).
   */
  async recordSellerAttribution(orderId: string, sellerNetIrr: number, platformCommissionIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Order economics attributed",
      "PAYMENT",
      orderId,
      currency,
      [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount: sellerNetIrr + platformCommissionIrr },
        { accountCode: LedgerAccountCode.SELLER_PAYABLE, direction: LedgerEntryDirection.CREDIT, amount: sellerNetIrr },
        { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount: platformCommissionIrr },
      ],
      client,
    );
  }

  /**
   * A marketplace-channel sale's platform-side posting (Handoff 14) — PET
   * LIFE OS never collected this customer's cash (spec: "do not create a
   * fake PaymentIntent representing money PET LIFE OS never collected"), so
   * this never touches CASH_GATEWAY_RECEIVABLE/CUSTOMER_PAYMENT_CLEARING.
   * MARKETPLACE_RECEIVABLE instead honestly represents "owed to the
   * platform by/against the channel", a business-to-business claim, not
   * customer payment collection. The seller's own receivable for this same
   * order is posted separately, in SellerLedgerService — PET LIFE OS still
   * owes the seller their net regardless of which channel currently holds
   * the customer's cash (see README "Marketplace sales").
   */
  async recordMarketplaceCommission(orderId: string, platformCommissionIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Marketplace order commission accrued",
      "PAYMENT",
      orderId,
      currency,
      [
        { accountCode: LedgerAccountCode.MARKETPLACE_RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: platformCommissionIrr },
        { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount: platformCommissionIrr },
      ],
      client,
    );
  }

  /**
   * A refund's platform-side reversal of a PET_LIFE-origin order's earlier
   * `recordSellerAttribution` (Handoff 14) — called *alongside*
   * `recordRefundSucceeded`, never replacing it: this undoes the
   * SELLER_PAYABLE/PLATFORM_REVENUE distribution back into
   * CUSTOMER_PAYMENT_CLEARING, and the existing H07 posting then carries
   * that same amount the rest of the way out through
   * CASH_GATEWAY_RECEIVABLE exactly as it always has — H07's own refund
   * ledger code is never touched. `sellerImpactIrr`/`platformShareIrr` are
   * expected to sum to the refunded amount (see
   * SellerFinanceService.applyRefundImpact, which derives them the same
   * balancer way attribution itself does); either may be legitimately zero
   * (e.g. a fully-discounted order has no platform share), so only the
   * non-zero legs are posted.
   */
  async recordSellerAttributionReversal(orderId: string, sellerImpactIrr: number, platformShareIrr: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const total = sellerImpactIrr + platformShareIrr;
    const entries: LedgerEntryInput[] = [{ accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount: total }];
    if (sellerImpactIrr > 0) entries.push({ accountCode: LedgerAccountCode.SELLER_PAYABLE, direction: LedgerEntryDirection.DEBIT, amount: sellerImpactIrr });
    if (platformShareIrr > 0) entries.push({ accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.DEBIT, amount: platformShareIrr });
    return this.recordBalanced("Order economics attribution reversed (refund)", "REFUND", orderId, currency, entries, client);
  }

  /**
   * A subscription billing attempt's platform-side distribution (Handoff
   * 16) — mirrors `recordSellerAttribution`'s own two-step shape
   * (`recordPaymentSucceeded` first moves cash into CUSTOMER_PAYMENT_CLEARING,
   * then this call distributes it), except subscription revenue has no
   * seller leg at all: the full amount is 100% platform revenue, so this
   * posts straight to the existing PLATFORM_REVENUE account with no new
   * LedgerAccountCode. `referenceId` is the SubscriptionBillingAttempt's own
   * id — the one row that explains "which charge funded this."
   */
  async recordSubscriptionRevenue(billingAttemptId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Subscription revenue recognized",
      "PAYMENT",
      billingAttemptId,
      currency,
      [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }

  /** The reversal counterpart to `recordSubscriptionRevenue` — called alongside `recordRefundSucceeded`, never replacing it, exactly like `recordSellerAttributionReversal`. */
  async recordSubscriptionRevenueReversal(billingAttemptId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Subscription revenue reversed (refund)",
      "REFUND",
      billingAttemptId,
      currency,
      [
        { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }

  /**
   * Handoff 18: a succeeded donation's platform-side distribution — mirrors
   * `recordSubscriptionRevenue`'s own two-step shape (cash already moved
   * into `CUSTOMER_PAYMENT_CLEARING` via `recordPaymentSucceeded`), except
   * donation money is never platform revenue (spec: "Donation money must
   * remain separate from commercial money... do NOT post donations into
   * normal commerce revenue logic") — it posts to the dedicated
   * `DONATION_PAYABLE` liability account instead, honestly representing
   * "PET LIFE OS is holding this on the organization's behalf." The
   * organization's own restricted/general income split is tracked
   * separately by `DonationLedgerService`, never here.
   */
  async recordDonationCollected(referenceId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Donation collected",
      "PAYMENT",
      referenceId,
      currency,
      [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.DONATION_PAYABLE, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }

  /** The reversal counterpart to `recordDonationCollected` — called alongside `recordRefundSucceeded`, never replacing it, exactly like `recordSubscriptionRevenueReversal`. */
  async recordDonationRefunded(referenceId: string, amount: number, currency: string, client: QueryClient = this.prisma): Promise<string> {
    return this.recordBalanced(
      "Donation refunded",
      "REFUND",
      referenceId,
      currency,
      [
        { accountCode: LedgerAccountCode.DONATION_PAYABLE, direction: LedgerEntryDirection.DEBIT, amount },
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount },
      ],
      client,
    );
  }
}
