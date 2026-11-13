import { Prisma, ProviderUserRole, SellerMembershipRole, SellerMembershipStatus, WalletOwnerType } from "@prisma/client";
import type { WalletOwnerDto } from "@petlife/types";

/** What every wallet listing selects so it can name the owner (member display name or organisation name). */
export const WALLET_OWNER_SELECT = {
  id: true,
  ownerType: true,
  userId: true,
  sellerOrganizationId: true,
  providerOrganizationId: true,
  currency: true,
  user: { select: { displayName: true } },
  sellerOrganization: { select: { name: true, verificationStatus: true } },
  providerOrganization: { select: { name: true, verificationStatus: true } },
} satisfies Prisma.WalletAccountSelect;

export type WalletAccountWithOwner = Prisma.WalletAccountGetPayload<{ select: typeof WALLET_OWNER_SELECT }>;

export function walletOwnerId(account: Pick<WalletAccountWithOwner, "ownerType" | "userId" | "sellerOrganizationId" | "providerOrganizationId">): string {
  if (account.ownerType === WalletOwnerType.SELLER) return account.sellerOrganizationId!;
  if (account.ownerType === WalletOwnerType.PROVIDER) return account.providerOrganizationId!;
  return account.userId!;
}

export function toWalletOwnerDto(account: WalletAccountWithOwner): WalletOwnerDto {
  const name =
    account.ownerType === WalletOwnerType.SELLER ? account.sellerOrganization?.name
    : account.ownerType === WalletOwnerType.PROVIDER ? account.providerOrganization?.name
    : account.user?.displayName;
  return { walletAccountId: account.id, type: account.ownerType, ownerId: walletOwnerId(account), name: name ?? "—" };
}

/** Whether the organisation behind a business wallet is VERIFIED (a member wallet has no organisation: true). */
export function ownerIsVerified(account: WalletAccountWithOwner): boolean {
  if (account.ownerType === WalletOwnerType.SELLER) return account.sellerOrganization?.verificationStatus === "VERIFIED";
  if (account.ownerType === WalletOwnerType.PROVIDER) return account.providerOrganization?.verificationStatus === "VERIFIED";
  return true;
}

/** Seller roles that may see, top up and spend the organisation's business wallet. */
export const SELLER_WALLET_ROLES: SellerMembershipRole[] = [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN, SellerMembershipRole.FINANCE];
/** Provider roles that may see, top up and spend the organisation's business wallet. */
export const PROVIDER_WALLET_ROLES: ProviderUserRole[] = [ProviderUserRole.OWNER];

/** Where the in-app notice and the Zibal return land for this wallet. */
export function walletPagePath(account: Pick<WalletAccountWithOwner, "id" | "ownerType">): string {
  return account.ownerType === WalletOwnerType.MEMBER ? "/profile/wallet" : `/profile/wallet/business/${account.id}`;
}

/**
 * Members who act for a wallet: the member themself, or the organisation's wallet managers. Used for notices and,
 * with `includeAllMembers`, for the "related wallets" rule of staff transfers (anyone active in the organisation).
 */
export async function walletPeople(
  client: Pick<Prisma.TransactionClient, "sellerMembership" | "providerUser">,
  account: Pick<WalletAccountWithOwner, "ownerType" | "userId" | "sellerOrganizationId" | "providerOrganizationId">,
  includeAllMembers = false,
): Promise<string[]> {
  if (account.ownerType === WalletOwnerType.MEMBER) return account.userId ? [account.userId] : [];
  if (account.ownerType === WalletOwnerType.SELLER) {
    const rows = await client.sellerMembership.findMany({
      where: { sellerOrganizationId: account.sellerOrganizationId!, status: SellerMembershipStatus.ACTIVE, ...(includeAllMembers ? {} : { role: { in: SELLER_WALLET_ROLES } }) },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }
  const rows = await client.providerUser.findMany({
    where: { providerOrganizationId: account.providerOrganizationId!, removedAt: null, ...(includeAllMembers ? {} : { role: { in: PROVIDER_WALLET_ROLES } }) },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
