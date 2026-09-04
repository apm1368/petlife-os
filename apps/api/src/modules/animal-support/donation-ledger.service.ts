import { Injectable } from "@nestjs/common";
import { CampaignFundType, DonationLedgerAccountCode, LedgerEntryDirection, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

export interface DonationLedgerEntryInput {
  accountCode: DonationLedgerAccountCode;
  direction: LedgerEntryDirection;
  amount: number;
}

/**
 * Structural clone of SellerLedgerService (Handoff 14) — the one place any
 * DonationLedgerTransaction/DonationLedgerEntry is ever created. Tracks each
 * Animal Support organization's OWN restricted-vs-general income split
 * (spec: "Restricted donations must remain restricted to their intended
 * purpose. Do not allow admin UI to silently transfer restricted funds into
 * general funds") — entirely separate from LedgerService's platform-level
 * DONATION_PAYABLE posting, which never distinguishes fund type.
 */
@Injectable()
export class DonationLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateAccount(organizationId: string, code: DonationLedgerAccountCode, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const existing = await client.donationLedgerAccount.findUnique({ where: { organizationId_code: { organizationId, code } } });
    if (existing) return existing.id;
    const created = await client.donationLedgerAccount.create({ data: { organizationId, code, currency } });
    return created.id;
  }

  async recordBalanced(
    organizationId: string,
    description: string,
    referenceType: "DONATION" | "DONATION_REFUND" | "PAYOUT",
    referenceId: string,
    currency: string,
    entries: DonationLedgerEntryInput[],
    client: QueryClient = this.prisma,
  ): Promise<string> {
    if (entries.length === 0) throw new Error("DonationLedgerService.recordBalanced called with no entries");
    for (const entry of entries) {
      if (entry.amount <= 0) throw new Error(`DonationLedgerService.recordBalanced: entry amount must be positive, got ${entry.amount}`);
    }
    const debitTotal = entries.filter((e) => e.direction === LedgerEntryDirection.DEBIT).reduce((sum, e) => sum + e.amount, 0);
    const creditTotal = entries.filter((e) => e.direction === LedgerEntryDirection.CREDIT).reduce((sum, e) => sum + e.amount, 0);
    if (debitTotal !== creditTotal) {
      throw new Error(`DonationLedgerService.recordBalanced: unbalanced entries for org ${organizationId} ${referenceType} ${referenceId} (debits=${debitTotal}, credits=${creditTotal})`);
    }

    const accountIds = new Map<DonationLedgerAccountCode, string>();
    for (const entry of entries) {
      if (!accountIds.has(entry.accountCode)) {
        accountIds.set(entry.accountCode, await this.getOrCreateAccount(organizationId, entry.accountCode, currency, client));
      }
    }

    const transaction = await client.donationLedgerTransaction.create({
      data: { organizationId, description, referenceType, referenceId, currency },
    });
    for (const entry of entries) {
      await client.donationLedgerEntry.create({
        data: {
          donationLedgerTransactionId: transaction.id,
          donationLedgerAccountId: accountIds.get(entry.accountCode)!,
          direction: entry.direction,
          amount: entry.amount,
        },
      });
    }

    return transaction.id;
  }

  /** A succeeded donation (spec: "public campaign should show ledger-backed raised amount") — receivable grows, income posts to the fund-type-specific account so restricted/general never comingle. */
  async recordDonationReceived(organizationId: string, donationTransactionId: string, amountIrr: number, fundType: CampaignFundType, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const incomeAccount = fundType === CampaignFundType.RESTRICTED ? DonationLedgerAccountCode.DONATION_INCOME_RESTRICTED : DonationLedgerAccountCode.DONATION_INCOME_GENERAL;
    return this.recordBalanced(
      organizationId,
      "Donation received",
      "DONATION",
      donationTransactionId,
      currency,
      [
        { accountCode: DonationLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: amountIrr },
        { accountCode: incomeAccount, direction: LedgerEntryDirection.CREDIT, amount: amountIrr },
      ],
      client,
    );
  }

  /** Reverses a donation's income posting exactly, same fund-type account it was originally posted to — never comingled into the other fund type on reversal. */
  async recordRefund(organizationId: string, donationTransactionId: string, amountIrr: number, fundType: CampaignFundType, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const incomeAccount = fundType === CampaignFundType.RESTRICTED ? DonationLedgerAccountCode.DONATION_INCOME_RESTRICTED : DonationLedgerAccountCode.DONATION_INCOME_GENERAL;
    return this.recordBalanced(
      organizationId,
      "Donation refunded",
      "DONATION_REFUND",
      donationTransactionId,
      currency,
      [
        { accountCode: incomeAccount, direction: LedgerEntryDirection.DEBIT, amount: amountIrr },
        { accountCode: DonationLedgerAccountCode.RECEIVABLE, direction: LedgerEntryDirection.CREDIT, amount: amountIrr },
      ],
      client,
    );
  }

  /**
   * Admin-recorded payout of funds actually sent to the organization (spec:
   * "inspect the donation ledger... support payout"). Debits the SAME
   * fund-specific income account the payout is drawn from — never the
   * shared RECEIVABLE account — so `getBalance` below can compute each
   * fund's available balance as that account's own running total, and a
   * restricted payout can never draw down general funds or vice versa
   * (spec: "do not allow admin UI to silently transfer restricted funds
   * into general funds"). The caller (AnimalSupportOrganizationService's
   * payout method) is responsible for checking the requested amount
   * against `getBalance` BEFORE calling this — this method only records
   * the posting once that check has passed.
   */
  async recordPayout(organizationId: string, payoutReferenceId: string, amountIrr: number, fundType: CampaignFundType, currency: string, client: QueryClient = this.prisma): Promise<string> {
    const incomeAccount = fundType === CampaignFundType.RESTRICTED ? DonationLedgerAccountCode.DONATION_INCOME_RESTRICTED : DonationLedgerAccountCode.DONATION_INCOME_GENERAL;
    return this.recordBalanced(
      organizationId,
      "Donation payout",
      "PAYOUT",
      payoutReferenceId,
      currency,
      [
        { accountCode: incomeAccount, direction: LedgerEntryDirection.DEBIT, amount: amountIrr },
        { accountCode: DonationLedgerAccountCode.PAYOUT_PAID, direction: LedgerEntryDirection.CREDIT, amount: amountIrr },
      ],
      client,
    );
  }

  /**
   * Derived balances only (spec: "Do not fake real-time raised amount from
   * cached UI values... use ledger-backed source of truth"). Each fund's
   * available balance is simply that fund's own income account balance
   * (credits = receipts, debits = refunds + payouts already drawn against
   * it) — general and restricted can never blur into one another because
   * every posting that touches either always names its specific account.
   */
  async getBalance(organizationId: string, client: QueryClient = this.prisma): Promise<{ generalAvailableIrr: number; restrictedAvailableIrr: number; paidIrr: number }> {
    const [generalAccount, restrictedAccount, paidAccount] = await Promise.all([
      client.donationLedgerAccount.findUnique({ where: { organizationId_code: { organizationId, code: DonationLedgerAccountCode.DONATION_INCOME_GENERAL } } }),
      client.donationLedgerAccount.findUnique({ where: { organizationId_code: { organizationId, code: DonationLedgerAccountCode.DONATION_INCOME_RESTRICTED } } }),
      client.donationLedgerAccount.findUnique({ where: { organizationId_code: { organizationId, code: DonationLedgerAccountCode.PAYOUT_PAID } } }),
    ]);

    const creditNormalBalance = async (accountId: string | undefined) => {
      if (!accountId) return 0;
      const entries = await client.donationLedgerEntry.findMany({ where: { donationLedgerAccountId: accountId }, select: { direction: true, amount: true } });
      return entries.reduce((sum, e) => sum + (e.direction === LedgerEntryDirection.CREDIT ? e.amount : -e.amount), 0);
    };

    const generalAvailableIrr = Math.max(0, await creditNormalBalance(generalAccount?.id));
    const restrictedAvailableIrr = Math.max(0, await creditNormalBalance(restrictedAccount?.id));
    const paidIrr = await creditNormalBalance(paidAccount?.id);

    return { generalAvailableIrr, restrictedAvailableIrr, paidIrr };
  }

  /** The fund-specific available balance a payout of `fundType` may draw against — the exact check the caller must pass before `recordPayout`. */
  async getAvailableForFund(organizationId: string, fundType: CampaignFundType, client: QueryClient = this.prisma): Promise<number> {
    const balance = await this.getBalance(organizationId, client);
    return fundType === CampaignFundType.RESTRICTED ? balance.restrictedAvailableIrr : balance.generalAvailableIrr;
  }

  /** spec: "public campaign should show ... amount raised ... use ledger-backed source of truth" — never a cached column on SupportCampaign. */
  async getCampaignRaisedIrr(campaignId: string, client: QueryClient = this.prisma): Promise<number> {
    const result = await client.donationTransaction.aggregate({ where: { campaignId, refundedAt: null }, _sum: { amountIrr: true } });
    return result._sum.amountIrr ?? 0;
  }
}
