import { ProviderVerificationStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { excludeDemoRecordsFromPublicReads } from "./public-record-origin";

/**
 * The one rule for showing a business to the public (owner, 2026-11-13: a
 * partner is public only after verification, enforced on the server).
 *
 * - A provider (clinic, groomer, boarding, sitter, trainer, pet taxi…) only
 *   once KYC is VERIFIED, and never a development fixture in production.
 * - A shop only when VERIFIED and ACTIVE (a suspended or closed shop sells
 *   nothing, even if it was verified once).
 *
 * Public listings use the `where` fragments; actions a customer starts from a
 * public page (availability, waitlist, quotes, favourites, reviews) check the
 * same rule with `isPublicProvider`, so a partner who just signed up stays
 * invisible and unbookable until staff approve them.
 */
export function publicProviderWhere(): { verificationStatus: typeof ProviderVerificationStatus.VERIFIED; isDemoRecord?: false } {
  return { verificationStatus: ProviderVerificationStatus.VERIFIED, ...excludeDemoRecordsFromPublicReads() };
}

export function isPublicProvider(org: { verificationStatus: string; isDemoRecord?: boolean | null } | null | undefined): boolean {
  if (!org || org.verificationStatus !== ProviderVerificationStatus.VERIFIED) return false;
  return !("isDemoRecord" in excludeDemoRecordsFromPublicReads()) || org.isDemoRecord !== true;
}

export const PUBLIC_SELLER_WHERE = { verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE } as const;
