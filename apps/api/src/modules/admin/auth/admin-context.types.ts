import type { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import type { AuthedRequest } from "../../../common/auth/current-user.decorator";
import type { AdminPermission } from "./admin-permissions";

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
  /// Effective permissions: the custom role's set when one is assigned, otherwise the built-in role's. Optional so
  /// hand-built contexts (tests, internal callers) fall back to ROLE_PERMISSIONS[role] — see adminCan().
  permissions?: AdminPermission[];
  /// The assigned custom role, if any (admin/access/roles).
  customRole?: { id: string; name: string; verticals: AdminVertical[] } | null;
}

export type AdminAuthedRequest = AuthedRequest & { adminContext?: ResolvedAdminContext };
