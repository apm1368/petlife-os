import type { SellerMembershipRole, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import type { AuthedRequest } from "../../../common/auth/current-user.decorator";

/**
 * Attached to the request by SellerAuthGuard once the caller's membership in
 * the path's `:sellerId` has been resolved (spec section 4) — every Seller
 * OS controller reads from this rather than re-deriving it. Unlike
 * ResolvedProviderContext (Handoff 05), there is no "active organization"
 * inference here: the seller organization always comes from the route's own
 * `:sellerId` param, checked against the caller's membership on every
 * request, never from an implicit session-wide context (spec section 4:
 * "Do not let users access seller data merely by guessing sellerOrganizationId").
 * SellerContextPreference (see seller-context.service.ts) exists only as a
 * frontend convenience for which seller to default to, and is never consulted
 * for authorization.
 */
export interface ResolvedSellerContext {
  sellerMembershipId: string;
  userId: string;
  role: SellerMembershipRole;
  sellerOrganizationId: string;
  sellerOrganizationName: string;
  sellerStatus: SellerStatus;
  verificationStatus: SellerVerificationStatus;
}

export type SellerAuthedRequest = AuthedRequest & { sellerContext?: ResolvedSellerContext };
