import { SetMetadata } from "@nestjs/common";
import type { ProviderUserRole } from "@prisma/client";

export const PROVIDER_ROLE_KEY = "providerRole";

/** Marks a handler as requiring one of the given ProviderUserRole values in the caller's active organization. */
export const RequireProviderRole = (...roles: ProviderUserRole[]) => SetMetadata(PROVIDER_ROLE_KEY, roles);
