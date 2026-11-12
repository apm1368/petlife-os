import { Injectable } from "@nestjs/common";
import { LedgerAccountCode, LedgerEntryDirection, WalletBalanceType, WalletCreditSource, WalletEntryKind, Prisma, type WalletEntry } from "@prisma/client";
import type { WalletBalancesDto, WalletEntryDto, WalletEntryPageDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { LedgerService } from "../ledger/ledger.service";
import { deriveWalletBalances, sixMonthGiftExpiry } from "./payment-infrastructure.policy";

type QueryClient = PrismaService | Prisma.TransactionClient;

type CreditInput = { userId: string; balanceType: WalletBalanceType; amount: number; source: WalletCreditSource; referenceType: string; referenceId: string; expiresAt?: Date; debitAccount?: LedgerAccountCode };

/** referenceType of entries written by a staff adjustment (referenceId = WalletAdjustment.id). */
export const WALLET_ADJUSTMENT_REFERENCE = "WALLET_ADJUSTMENT";
/** referenceType of entries written by a member top-up (referenceId = WalletTopUp.id). */
export const WALLET_TOP_UP_REFERENCE = "WALLET_TOP_UP";

export function toBalancesDto(balances: Record<WalletBalanceType, number>, currency = "IRR"): WalletBalancesDto {
  const purchaseOnly = balances[WalletBalanceType.PURCHASE_ONLY];
  const withdrawable = balances[WalletBalanceType.WITHDRAWABLE];
  return { purchaseOnly, withdrawable, total: purchaseOnly + withdrawable, currency };
}

function entryPurpose(entry: Pick<WalletEntry, "kind" | "referenceType" | "source">): WalletEntryDto["purpose"] {
  if (entry.kind === WalletEntryKind.EXPIRY) return "EXPIRY";
  if (entry.referenceType === WALLET_TOP_UP_REFERENCE) return "TOP_UP";
  if (entry.referenceType === WALLET_ADJUSTMENT_REFERENCE) return "ADJUSTMENT";
  if (entry.referenceType === "PAYMENT_INTENT") return "PURCHASE";
  if (/REFUND|OVERPAYMENT/.test(entry.referenceType) || entry.source === WalletCreditSource.REFUND || entry.source === WalletCreditSource.OVERPAYMENT) return "REFUND";
  return "OTHER";
}

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

  async credit(input: CreditInput, client: QueryClient = this.prisma): Promise<string> {
    return (await this.creditEntry(input, client)).ledgerTransactionId;
  }

  /** Same as credit(), also returning the WalletEntry it wrote (top-ups and adjustments point at it). */
  async creditEntry(input: CreditInput, client: QueryClient = this.prisma): Promise<{ ledgerTransactionId: string; entryId: string }> {
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
    const entry = await client.walletEntry.create({
      data: {
        walletAccountId: wallet.id, ledgerTransactionId, balanceType: input.balanceType, kind: WalletEntryKind.CREDIT,
        source: input.source, amount: input.amount, referenceType: input.referenceType, referenceId: input.referenceId,
        expiresAt: input.expiresAt ?? (input.source === WalletCreditSource.GIFT ? sixMonthGiftExpiry() : null),
      },
    });
    return { ledgerTransactionId, entryId: entry.id };
  }

  /**
   * A staff correction that takes money out of one bucket. The caller holds the account lock (lockAccount) so two
   * corrections can never both pass the balance check; a bucket never goes below zero.
   */
  async debitForAdjustment(input: { walletAccountId: string; balanceType: WalletBalanceType; amount: number; referenceId: string }, client: Prisma.TransactionClient): Promise<{ ledgerTransactionId: string; entryId: string }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    const entries = await client.walletEntry.findMany({ where: { walletAccountId: input.walletAccountId } });
    if (deriveWalletBalances(entries)[input.balanceType] < input.amount) throw new ValidationApiException({ field: "amount", reason: "INSUFFICIENT_WALLET_BALANCE" });
    const ledgerTransactionId = await this.ledger.recordBalanced("Wallet adjustment debit", "WALLET_ADJUSTMENT", input.referenceId, "IRR", [
      { accountCode: accountFor(input.balanceType), direction: LedgerEntryDirection.DEBIT, amount: input.amount },
      { accountCode: LedgerAccountCode.WALLET_ADJUSTMENT, direction: LedgerEntryDirection.CREDIT, amount: input.amount },
    ], client);
    const entry = await client.walletEntry.create({
      data: { walletAccountId: input.walletAccountId, ledgerTransactionId, balanceType: input.balanceType, kind: WalletEntryKind.DEBIT, source: WalletCreditSource.MANUAL_CORRECTION, amount: input.amount, referenceType: WALLET_ADJUSTMENT_REFERENCE, referenceId: input.referenceId },
    });
    return { ledgerTransactionId, entryId: entry.id };
  }

  /** The member's wallet, created on first use; row-locked for the rest of the transaction. */
  async lockAccount(userId: string, client: Prisma.TransactionClient) {
    const account = await this.accountForUser(userId, client);
    await client.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
    return account;
  }

  async summary(userId: string, now = new Date()): Promise<{ balances: WalletBalancesDto; expiringSoon: { amount: number; expiresAt: string }[] }> {
    const account = await this.prisma.walletAccount.findUnique({ where: { userId }, include: { entries: true } });
    const entries = account?.entries ?? [];
    const balances = toBalancesDto(deriveWalletBalances(entries, now), account?.currency ?? "IRR");
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    let left = balances.purchaseOnly;
    const expiringSoon = entries
      .filter((e) => e.kind === WalletEntryKind.CREDIT && e.expiresAt && e.expiresAt > now && e.expiresAt <= horizon)
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime())
      .map((e) => {
        // Never promise more than is left to spend: spent gift money cannot expire again.
        const amount = Math.min(e.amount, left);
        left -= amount;
        return { amount, expiresAt: e.expiresAt!.toISOString() };
      })
      .filter((e) => e.amount > 0);
    return { balances, expiringSoon };
  }

  /** The member's own movements, newest first, with a cursor (the last entry id of the previous page). */
  async history(userId: string, query: { cursor?: string; limit?: number }): Promise<WalletEntryPageDto> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const account = await this.prisma.walletAccount.findUnique({ where: { userId } });
    if (!account) return { items: [], nextCursor: null };
    const rows = await this.prisma.walletEntry.findMany({
      where: { walletAccountId: account.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return { items: await this.toEntryDtos(page), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  }

  async toEntryDtos(rows: WalletEntry[]): Promise<WalletEntryDto[]> {
    const adjustmentIds = rows.filter((r) => r.referenceType === WALLET_ADJUSTMENT_REFERENCE).map((r) => r.referenceId);
    const adjustments = adjustmentIds.length
      ? await this.prisma.walletAdjustment.findMany({ where: { id: { in: adjustmentIds } }, select: { id: true, reasonCode: true } })
      : [];
    const reasonOf = new Map(adjustments.map((a) => [a.id, a.reasonCode]));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      balanceType: r.balanceType,
      source: r.source,
      signedAmount: r.kind === WalletEntryKind.CREDIT ? r.amount : -r.amount,
      purpose: entryPurpose(r),
      note: reasonOf.get(r.referenceId) ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async debitForPurchase(input: { userId: string; amount: number; referenceType: string; referenceId: string }, client: QueryClient = this.prisma): Promise<{ withdrawable: number; purchaseOnly: number }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    const wallet = await this.accountForUser(input.userId, client);
    // Serialise spends on one wallet: two concurrent checkouts must not both pass the balance check.
    await client.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${wallet.id}::uuid FOR UPDATE`;
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
