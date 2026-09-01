import type { ProviderUserRole, ProviderVerificationStatus } from "@prisma/client";
import type { AuthedRequest } from "../../../common/auth/current-user.decorator";

/**
 * Attached to the request by ProviderAuthGuard once the active organization
 * has been resolved (see ProviderContextService.resolveActiveMembership) —
 * every Provider OS controller reads from this rather than re-deriving it.
 */
export interface ResolvedProviderContext {
  providerUserId: string;
  userId: string;
  role: ProviderUserRole;
  displayTitle: string | null;
  organizationId: string;
  organizationName: string;
  verificationStatus: ProviderVerificationStatus;
}

export type ProviderAuthedRequest = AuthedRequest & { providerContext?: ResolvedProviderContext };
