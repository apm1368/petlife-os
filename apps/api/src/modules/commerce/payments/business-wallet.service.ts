import { Injectable } from "@nestjs/common";
import { SellerMembershipStatus, WalletOwnerType, type WalletTopUpRail } from "@prisma/client";
import type { BusinessWalletDto, WalletEntryPageDto, WalletSummaryDto, WalletTopUpDto, WalletTopUpStartedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { deriveWalletBalances } from "./payment-infrastructure.policy";
import { WalletService, toBalancesDto } from "./wallet.service";
import { WalletTopUpService } from "./wallet-top-up.service";
import { PROVIDER_WALLET_ROLES, SELLER_WALLET_ROLES, WALLET_OWNER_SELECT, toWalletOwnerDto, walletPagePath, walletPeople, type WalletAccountWithOwner } from "./wallet-owner";

/** A member manages at most this many organisations' wallets in one listing (a guard, not a business rule). */
const MAX_MANAGED_WALLETS = 25;

/**
 * Partner business wallets, seen from the member side: one wallet per seller or provider organisation, kept apart
 * from the member's own wallet. Only the organisation's wallet managers (seller OWNER/ADMIN/FINANCE, provider OWNER)
 * can see it or top it up; for anyone else the wallet does not exist (404).
 */
@Injectable()
export class BusinessWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly topUps: WalletTopUpService,
  ) {}

  /** The business wallets the member manages; each organisation's wallet is created (empty) the first time. */
  async listMine(userId: string): Promise<BusinessWalletDto[]> {
    const [sellers, providers] = await Promise.all([
      this.prisma.sellerMembership.findMany({ where: { userId, status: SellerMembershipStatus.ACTIVE, role: { in: SELLER_WALLET_ROLES } }, select: { sellerOrganizationId: true, role: true }, take: MAX_MANAGED_WALLETS }),
      this.prisma.providerUser.findMany({ where: { userId, removedAt: null, role: { in: PROVIDER_WALLET_ROLES } }, select: { providerOrganizationId: true, role: true }, take: MAX_MANAGED_WALLETS }),
    ]);
    const roleByAccount = new Map<string, string>();
    for (const s of sellers) roleByAccount.set((await this.wallet.accountForOwner({ type: WalletOwnerType.SELLER, id: s.sellerOrganizationId })).id, s.role);
    for (const p of providers) roleByAccount.set((await this.wallet.accountForOwner({ type: WalletOwnerType.PROVIDER, id: p.providerOrganizationId })).id, p.role);
    if (!roleByAccount.size) return [];
    const accounts = await this.prisma.walletAccount.findMany({ where: { id: { in: [...roleByAccount.keys()] } }, select: { ...WALLET_OWNER_SELECT, entries: true } });
    const now = new Date();
    return accounts
      .map((a) => ({ owner: toWalletOwnerDto(a), role: roleByAccount.get(a.id)!, balances: toBalancesDto(deriveWalletBalances(a.entries, now), a.currency) }))
      .sort((x, y) => x.owner.name.localeCompare(y.owner.name));
  }

  /** The business wallet, if this member manages it; otherwise it does not exist for them. */
  async assertManager(userId: string, walletAccountId: string): Promise<WalletAccountWithOwner> {
    const account = await this.prisma.walletAccount.findUnique({ where: { id: walletAccountId }, select: WALLET_OWNER_SELECT });
    if (!account || account.ownerType === WalletOwnerType.MEMBER) throw new NotFoundApiException("Wallet");
    if (!(await walletPeople(this.prisma, account)).includes(userId)) throw new NotFoundApiException("Wallet");
    return account;
  }

  async summary(userId: string, walletAccountId: string): Promise<WalletSummaryDto> {
    const account = await this.assertManager(userId, walletAccountId);
    const { balances, expiringSoon } = await this.wallet.summaryForAccount(account.id);
    return { owner: toWalletOwnerDto(account), balances, expiringSoon, topUp: await this.topUps.options() };
  }

  async entries(userId: string, walletAccountId: string, query: { cursor?: string; limit?: number }): Promise<WalletEntryPageDto> {
    await this.assertManager(userId, walletAccountId);
    return this.wallet.historyForAccount(walletAccountId, query);
  }

  async listTopUps(userId: string, walletAccountId: string): Promise<WalletTopUpDto[]> {
    await this.assertManager(userId, walletAccountId);
    return this.topUps.listForAccount(walletAccountId);
  }

  async startTopUp(userId: string, walletAccountId: string, input: { amount: number; rail: WalletTopUpRail; locale: string }, idempotencyKey: string | undefined): Promise<WalletTopUpStartedDto> {
    const account = await this.assertManager(userId, walletAccountId);
    return this.topUps.start(userId, input, idempotencyKey, { walletAccountId: account.id, returnPath: walletPagePath(account) });
  }
}
