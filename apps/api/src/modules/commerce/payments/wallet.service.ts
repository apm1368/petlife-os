import { Injectable } from "@nestjs/common";
import { LedgerAccountCode, LedgerEntryDirection, WalletBalanceType, WalletCreditSource, WalletEntryKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { LedgerService } from "../ledger/ledger.service";
import { deriveWalletBalances, sixMonthGiftExpiry } from "./payment-infrastructure.policy";

type QueryClient = PrismaService | Prisma.TransactionClient;

function accountFor(balanceType: WalletBalanceType): LedgerAccountCode {
  return balanceType === WalletBalanceType.WITHDRAWABLE
    ? LedgerAccountCode.WALLET_WITHDRAWABLE_LIABILITY
    : LedgerAccountCode.WALLET_PURCHASE_LIABILITY;
}

/** Personal, append-only two-bucket wallet. No method mutates a balance field. */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async getBalances(userId: string, now = new Date()) {
    const account = await this.prisma.walletAccount.findUnique({ where: { userId }, include: { entries: true } });
    return deriveWalletBalances(account?.entries ?? [], now);
  }

  private async accountForUser(userId: string, client: QueryClient) {
    return client.walletAccount.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async credit(input: { userId: string; balanceType: WalletBalanceType; amount: number; source: WalletCreditSource; referenceType: string; referenceId: string; expiresAt?: Date; debitAccount?: LedgerAccountCode }, client: QueryClient = this.prisma): Promise<string> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    const wallet = await this.accountForUser(input.userId, client);
    const ledgerTransactionId = await this.ledger.recordBalanced(
      `Wallet credit: ${input.source}`,
      "WALLET_CREDIT",
      input.referenceId,
      "IRR",
      [
        { accountCode: input.debitAccount ?? LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount: input.amount },
        { accountCode: accountFor(input.balanceType), direction: LedgerEntryDirection.CREDIT, amount: input.amount },
      ],
      client,
    );
    await client.walletEntry.create({
      data: {
        walletAccountId: wallet.id, ledgerTransactionId, balanceType: input.balanceType, kind: WalletEntryKind.CREDIT,
        source: input.source, amount: input.amount, referenceType: input.referenceType, referenceId: input.referenceId,
        expiresAt: input.expiresAt ?? (input.source === WalletCreditSource.GIFT ? sixMonthGiftExpiry() : null),
      },
    });
    return ledgerTransactionId;
  }

  async debitForPurchase(input: { userId: string; amount: number; referenceType: string; referenceId: string }, client: QueryClient = this.prisma): Promise<{ withdrawable: number; purchaseOnly: number }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    const wallet = await this.accountForUser(input.userId, client);
    const entries = await client.walletEntry.findMany({ where: { walletAccountId: wallet.id } });
    const balances = deriveWalletBalances(entries);
    if (balances[WalletBalanceType.WITHDRAWABLE] + balances[WalletBalanceType.PURCHASE_ONLY] < input.amount) {
      throw new ValidationApiException({ field: "wallet", reason: "INSUFFICIENT_WALLET_BALANCE" });
    }
    const withdrawable = Math.min(balances[WalletBalanceType.WITHDRAWABLE], input.amount);
    const purchaseOnly = input.amount - withdrawable;
    for (const [balanceType, amount] of [[WalletBalanceType.WITHDRAWABLE, withdrawable], [WalletBalanceType.PURCHASE_ONLY, purchaseOnly]] as const) {
      if (!amount) continue;
      const ledgerTransactionId = await this.ledger.recordBalanced(
        "Wallet purchase debit", "WALLET_DEBIT", input.referenceId, "IRR",
        [
          { accountCode: accountFor(balanceType), direction: LedgerEntryDirection.DEBIT, amount },
          { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount },
        ], client,
      );
      await client.walletEntry.create({ data: { walletAccountId: wallet.id, ledgerTransactionId, balanceType, kind: WalletEntryKind.DEBIT, amount, referenceType: input.referenceType, referenceId: input.referenceId } });
    }
    return { withdrawable, purchaseOnly };
  }

  /** Appends (never removes) expiry records for matured gift credits. */
  async expireGiftCredits(now = new Date()): Promise<number> {
    const expired = await this.prisma.walletEntry.findMany({ where: { kind: WalletEntryKind.CREDIT, source: WalletCreditSource.GIFT, expiresAt: { lte: now } } });
    let count = 0;
    for (const credit of expired) {
      const alreadyExpired = await this.prisma.walletEntry.findFirst({ where: { kind: WalletEntryKind.EXPIRY, referenceType: "WALLET_GIFT_EXPIRY", referenceId: credit.id } });
      if (alreadyExpired) continue;
      await this.prisma.$transaction(async (tx) => {
        const ledgerTransactionId = await this.ledger.recordBalanced("Gift wallet credit expired", "WALLET_EXPIRY", credit.id, "IRR", [
          { accountCode: LedgerAccountCode.WALLET_PURCHASE_LIABILITY, direction: LedgerEntryDirection.DEBIT, amount: credit.amount },
          { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount: credit.amount },
        ], tx);
        await tx.walletEntry.create({ data: { walletAccountId: credit.walletAccountId, ledgerTransactionId, balanceType: WalletBalanceType.PURCHASE_ONLY, kind: WalletEntryKind.EXPIRY, amount: credit.amount, referenceType: "WALLET_GIFT_EXPIRY", referenceId: credit.id } });
      });
      count++;
    }
    return count;
  }
}
