import { SetMetadata } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";

export const SELLER_ROLE_KEY = "sellerRole";

/**
 * Marks a handler as requiring one of the given SellerMembershipRole values
 * (spec section 4) — OWNER and ADMIN always satisfy any requirement (full
 * access), mirroring how an org owner/admin is never blocked by a
 * specialized-role check in real seller tooling. A handler with no
 * decorator is reachable by any ACTIVE membership, VIEWER included
 * (read-only routes). See SellerAuthGuard.roleSatisfies for the exact rule.
 */
export const RequireSellerRole = (...roles: SellerMembershipRole[]) => SetMetadata(SELLER_ROLE_KEY, roles);
