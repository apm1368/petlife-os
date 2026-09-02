import { SetMetadata } from "@nestjs/common";
import type { AdminPermission } from "./admin-permissions";

export const ADMIN_PERMISSION_KEY = "adminPermission";

/**
 * Marks a handler as requiring one of the given AdminPermission values (any
 * one is sufficient, mirroring RequireSellerRole's "any of the given roles"
 * shape). A handler with no decorator is reachable by any ACTIVE AdminUser
 * regardless of role — use this on every route that reads or mutates
 * anything beyond "the caller is some kind of admin" (spec: least privilege,
 * "do not make every admin all-powerful").
 */
export const RequireAdminPermission = (...permissions: AdminPermission[]) => SetMetadata(ADMIN_PERMISSION_KEY, permissions);
