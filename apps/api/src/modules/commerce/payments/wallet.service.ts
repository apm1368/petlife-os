import { Injectable } from "@nestjs/common";
import { LedgerAccountCode, LedgerEntryDirection, WalletBalanceType, WalletCreditSource, WalletEntryKind, WalletOwnerType, Prisma, type WalletAccount, type WalletEntry } from "@prisma/client";
import type { WalletBalancesDto, WalletEntryDto, WalletEntryPageDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { LedgerService } from "../ledger/ledger.service";
import { deriveWalletBalances, replayWallet, sixMonthGiftExpiry } from "./payment-infrastructure.policy";

type QueryClient = PrismaService | Prisma.TransactionClient;

/** A wallet's owner: a member (user id) or a partner organisation (seller or provider organisation id). */
export type WalletOwnerRef = { type: WalletOwnerType; id: string };

/** Which wallet: a member's own (userId) or any wallet by id (walletAccountId wins when both are given). */
type CreditInput = { userId?: string; walletAccountId?: string; balanceType: WalletBalanceType; amount: number; source: WalletCreditSource; referenceType: string; referenceId: string; expiresAt?: Date; debitAccount?: LedgerAccountCode };

/** referenceType of entries written by a staff adjustment (referenceId = WalletAdjustment.id). */
export const WALLET_ADJUSTMENT_REFERENCE = "WALLET_ADJUSTMENT";
/** referenceType of entries written by a member top-up (referenceId = WalletTopUp.id). */
export const WALLET_TOP_UP_REFERENCE = "WALLET_TOP_UP";
/** referenceType of both entries written by a two-person staff transfer (referenceId = WalletTransferRequest.id). */
export const WALLET_TRANSFER_REFERENCE = "WALLET_TRANSFER";
/** referenceType of a billed sponsored-listing click (referenceId = SponsoredClick.id); its refund adds "_REFUND". */
export const SPONSORED_CLICK_REFERENCE = "SPONSORED_CLICK";

export function toBalancesDto(balances: Record<WalletBalanceType, number>, currency = "IRR"): WalletBalancesDto {
  const purchaseOnly = balances[WalletBalanceType.PURCHASE_ONLY];
  const withdrawable = balances[WalletBalanceType.WITHDRAWABLE];
  return { purchaseOnly, withdrawable, total: purchaseOnly + withdrawable, currency };
}

function entryPurpose(entry: Pick<WalletEntry, "kind" | "referenceType" | "source">): WalletEntryDto["purpose"] {
  if (entry.kind === WalletEntryKind.EXPIRY) return "EXPIRY";
  if (entry.referenceType === WALLET_TOP_UP_REFERENCE) return "TOP_UP";
  if (entry.referenceType === WALLET_ADJUSTMENT_REFERENCE) return "ADJUSTMENT";
  if (entry.referenceType === WALLET_TRANSFER_REFERENCE) return "TRANSFER";
  if (entry.referenceType === SPONSORED_CLICK_REFERENCE) return "SPONSORED_CLICK";
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

  /** The owner's wallet, created empty on first use (a member's own, or an organisation's business wallet). */
  async accountForOwner(owner: WalletOwnerRef, client: QueryClient = this.prisma): Promise<WalletAccount> {
    switch (owner.type) {
      case WalletOwnerType.MEMBER:
        return this.accountForUser(owner.id, client);
      case WalletOwnerType.SELLER:
        return client.walletAccount.upsert({ where: { sellerOrganizationId: owner.id }, update: {}, create: { ownerType: WalletOwnerType.SELLER, sellerOrganizationId: owner.id } });
      case WalletOwnerType.PROVIDER:
        return client.walletAccount.upsert({ where: { providerOrganizationId: owner.id }, update: {}, create: { ownerType: WalletOwnerType.PROVIDER, providerOrganizationId: owner.id } });
    }
  }

  /**
   * Pays for a service (a sponsored-listing click) out of ONE bucket — purchase-only credit first (top-ups and gifts),
   * then withdrawable — so the payment is a single wallet entry. Returns null when neither bucket can cover it. The
   * caller holds the wallet lock (lockAccountById).
   */
  async debitForService(
    input: { walletAccountId: string; amount: number; referenceType: string; referenceId: string; creditAccount: LedgerAccountCode; description: string },
    client: Prisma.TransactionClient,
  ): Promise<{ entryId: string; balanceType: WalletBalanceType } | null> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    const balances = await this.balancesOf(input.walletAccountId, client);
    const balanceType = balances[WalletBalanceType.PURCHASE_ONLY] >= input.amount ? WalletBalanceType.PURCHASE_ONLY : balances[WalletBalanceType.WITHDRAWABLE] >= input.amount ? WalletBalanceType.WITHDRAWABLE : null;
    if (!balanceType) return null;
    const ledgerTransactionId = await this.ledger.recordBalanced(input.description, input.referenceType, input.referenceId, "IRR", [
      { accountCode: accountFor(balanceType), direction: LedgerEntryDirection.DEBIT, amount: input.amount },
      { accountCode: input.creditAccount, direction: LedgerEntryDirection.CREDIT, amount: input.amount },
    ], client);
    const entry = await client.walletEntry.create({
      data: { walletAccountId: input.walletAccountId, ledgerTransactionId, balanceType, kind: WalletEntryKind.DEBIT, amount: input.amount, referenceType: input.referenceType, referenceId: input.referenceId },
    });
    return { entryId: entry.id, balanceType };
  }

  /** Row-locks a wallet for the rest of the transaction (spends and transfers serialise on it). */
  async lockAccountById(walletAccountId: string, client: Prisma.TransactionClient): Promise<void> {
    await client.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${walletAccountId}::uuid FOR UPDATE`;
  }

  async balancesOf(walletAccountId: string, client: QueryClient = this.prisma, now = new Date()) {
    return deriveWalletBalances(await client.walletEntry.findMany({ where: { walletAccountId } }), now);
  }

  /**
   * Posts an approved staff transfer: a debit on the source and a credit on the destination, each with its own
   * balanced ledger transaction through WALLET_TRANSFER_CLEARING (which therefore nets to zero). The caller holds both
   * wallet locks and has re-checked the request; the source bucket never goes below zero.
   */
  async postTransfer(
    input: { fromWalletAccountId: string; toWalletAccountId: string; balanceType: WalletBalanceType; amount: number; transferId: string },
    client: Prisma.TransactionClient,
  ): Promise<{ debitEntryId: string; creditEntryId: string }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    if (input.fromWalletAccountId === input.toWalletAccountId) throw new ValidationApiException({ field: "to", reason: "SAME_WALLET" });
    if ((await this.balancesOf(input.fromWalletAccountId, client))[input.balanceType] < input.amount) {
      throw new ValidationApiException({ field: "amount", reason: "INSUFFICIENT_WALLET_BALANCE" });
    }
    const out = await this.ledger.recordBalanced("Wallet transfer out", WALLET_TRANSFER_REFERENCE, input.transferId, "IRR", [
      { accountCode: accountFor(input.balanceType), direction: LedgerEntryDirection.DEBIT, amount: input.amount },
      { accountCode: LedgerAccountCode.WALLET_TRANSFER_CLEARING, direction: LedgerEntryDirection.CREDIT, amount: input.amount },
    ], client);
    const debit = await client.walletEntry.create({
      data: { walletAccountId: input.fromWalletAccountId, ledgerTransactionId: out, balanceType: input.balanceType, kind: WalletEntryKind.DEBIT, source: WalletCreditSource.TRANSFER, amount: input.amount, referenceType: WALLET_TRANSFER_REFERENCE, referenceId: input.transferId },
    });
    const into = await this.ledger.recordBalanced("Wallet transfer in", WALLET_TRANSFER_REFERENCE, input.transferId, "IRR", [
      { accountCode: LedgerAccountCode.WALLET_TRANSFER_CLEARING, direction: LedgerEntryDirection.DEBIT, amount: input.amount },
      { accountCode: accountFor(input.balanceType), direction: LedgerEntryDirection.CREDIT, amount: input.amount },
    ], client);
    const credit = await client.walletEntry.create({
      data: { walletAccountId: input.toWalletAccountId, ledgerTransactionId: into, balanceType: input.balanceType, kind: WalletEntryKind.CREDIT, source: WalletCreditSource.TRANSFER, amount: input.amount, referenceType: WALLET_TRANSFER_REFERENCE, referenceId: input.transferId },
    });
    return { debitEntryId: debit.id, creditEntryId: credit.id };
  }

  async credit(input: CreditInput, client: QueryClient = this.prisma): Promise<string> {
    return (await this.creditEntry(input, client)).ledgerTransactionId;
  }

  /** Same as credit(), also returning the WalletEntry it wrote (top-ups and adjustments point at it). */
  async creditEntry(input: CreditInput, client: QueryClient = this.prisma): Promise<{ ledgerTransactionId: string; entryId: string }> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ValidationApiException({ field: "amount", reason: "INTEGER_RIAL_REQUIRED" });
    if (!input.walletAccountId && !input.userId) throw new Error("WalletService.creditEntry needs a walletAccountId or a userId");
    const wallet = input.walletAccountId ? { id: input.walletAccountId } : await this.accountForUser(input.userId!, client);
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
    return this.summaryOf(await this.prisma.walletAccount.findUnique({ where: { userId }, include: { entries: true } }), now);
  }

  async summaryForAccount(walletAccountId: string, now = new Date()): Promise<{ balances: WalletBalancesDto; expiringSoon: { amount: number; expiresAt: string }[] }> {
    return this.summaryOf(await this.prisma.walletAccount.findUnique({ where: { id: walletAccountId }, include: { entries: true } }), now);
  }

  private summaryOf(account: (WalletAccount & { entries: WalletEntry[] }) | null, now: Date): { balances: WalletBalancesDto; expiringSoon: { amount: number; expiresAt: string }[] } {
    const replay = replayWallet(account?.entries ?? [], now);
    const balances = toBalancesDto(replay.balances, account?.currency ?? "IRR");
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // Only what is still unspent of each gift can expire.
    const expiringSoon = replay.open
      .filter((lot) => lot.expiresAt <= horizon)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .map((lot) => ({ amount: lot.remaining, expiresAt: lot.expiresAt.toISOString() }));
    return { balances, expiringSoon };
  }

  /** The member's own movements, newest first, with a cursor (the last entry id of the previous page). */
  async history(userId: string, query: { cursor?: string; limit?: number }): Promise<WalletEntryPageDto> {
    const account = await this.prisma.walletAccount.findUnique({ where: { userId } });
    if (!account) return { items: [], nextCursor: null };
    return this.historyForAccount(account.id, query);
  }

  /** One wallet's movements, newest first, with a cursor (the last entry id of the previous page). */
  async historyForAccount(walletAccountId: string, query: { cursor?: string; limit?: number }): Promise<WalletEntryPageDto> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const account = { id: walletAccountId };
    if (query.cursor && !(await this.prisma.walletEntry.findFirst({ where: { id: query.cursor, walletAccountId }, select: { id: true } }))) {
      throw new ValidationApiException({ field: "cursor", reason: "INVALID_CURSOR" });
    }
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
    const transferIds = rows.filter((r) => r.referenceType === WALLET_TRANSFER_REFERENCE).map((r) => r.referenceId);
    const transfers = transferIds.length
      ? await this.prisma.walletTransferRequest.findMany({ where: { id: { in: transferIds } }, select: { id: true, reasonCode: true } })
      : [];
    const reasonOf = new Map([...adjustments.map((a) => [a.id, a.reasonCode] as const), ...transfers.map((t) => [t.id, t.reasonCode] as const)]);
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

  /**
   * Appends (never removes) expiry records for matured gift credits: one per lapsed gift, for its unspent remainder only
   * (a gift that was fully spent leaves nothing to expire), so the ledger matches the replayed balance.
   */
  async expireGiftCredits(now = new Date()): Promise<number> {
    const accounts = await this.prisma.walletAccount.findMany({ where: { entries: { some: { kind: WalletEntryKind.CREDIT, expiresAt: { lte: now } } } }, include: { entries: true } });
    let count = 0;
    for (const account of accounts) {
      const recorded = new Set(account.entries.filter((e) => e.kind === WalletEntryKind.EXPIRY && e.referenceType === "WALLET_GIFT_EXPIRY").map((e) => e.referenceId));
      for (const lot of replayWallet(account.entries, now).expired) {
        if (recorded.has(lot.creditId)) continue;
        await this.prisma.$transaction(async (tx) => {
          const ledgerTransactionId = await this.ledger.recordBalanced("Gift wallet credit expired", "WALLET_EXPIRY", lot.creditId, "IRR", [
            { accountCode: accountFor(lot.balanceType), direction: LedgerEntryDirection.DEBIT, amount: lot.remaining },
            { accountCode: LedgerAccountCode.PLATFORM_REVENUE, direction: LedgerEntryDirection.CREDIT, amount: lot.remaining },
          ], tx);
          await tx.walletEntry.create({ data: { walletAccountId: account.id, ledgerTransactionId, balanceType: lot.balanceType, kind: WalletEntryKind.EXPIRY, amount: lot.remaining, referenceType: "WALLET_GIFT_EXPIRY", referenceId: lot.creditId } });
        });
        count++;
      }
    }
    return count;
  }
}
