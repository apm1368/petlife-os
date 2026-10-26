import type { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import type { AuthedRequest } from "../../../common/auth/current-user.decorator";

/**
 * Attached to the request by AdminAuthGuard once the caller's consumer
 * session has been confirmed to also hold an ACTIVE AdminUser row (spec:
 * "no implicit access through normal user session alone... reuse consumer
 * session mechanism, but require an explicit AdminUser row check") — mirrors
 * ResolvedSellerContext/ResolvedProviderContext's own "guard resolves once,
 * every handler reads from the request" shape.
 */
export interface ResolvedAdminContext {
  adminUserId: string;
  userId: string;
  displayName: string;
  role: AdminRole;
  status: AdminMembershipStatus;
  /// Only meaningful for a SERVICE_ADMIN; empty for every other role (see admin-verticals.ts).
  serviceScopes: AdminVertical[];
}

export type AdminAuthedRequest = AuthedRequest & { adminContext?: ResolvedAdminContext };
