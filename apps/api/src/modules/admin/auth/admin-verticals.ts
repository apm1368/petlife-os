import { AdminRole, AdminVertical } from "@prisma/client";
import type { ResolvedAdminContext } from "./admin-context.types";

/**
 * Permissions say what an admin may *do*; verticals say which rows they may do it *to*. The two are
 * deliberately separate: `commerce.view` is one permission whether the caller runs the shop or the
 * whole platform, so without this second axis a shop administrator handed `commerce.view` would also
 * read clinic bookings and accommodation stays through the same endpoints.
 *
 * A role missing from this map is unscoped and reaches every vertical — that is every role that
 * existed before Wave 2, so adding scoping here cannot narrow access anyone already had.
 */
const ROLE_VERTICALS: Partial<Record<AdminRole, AdminVertical[]>> = {
  [AdminRole.CONTENT_ADMIN]: [AdminVertical.CONTENT],
  [AdminRole.SHOP_ADMIN]: [AdminVertical.SHOP],
  [AdminRole.SUPPORT_AGENT]: [AdminVertical.SUPPORT],
  // SERVICE_ADMIN is intentionally absent: its verticals come from the admin's own serviceScopes.
};

/** The service verticals a SERVICE_ADMIN may be scoped to. Shop, content and support are their own roles. */
export const SERVICE_VERTICALS: AdminVertical[] = [
  AdminVertical.CLINIC,
  AdminVertical.GROOMING,
  AdminVertical.ACCOMMODATION,
  AdminVertical.INSURANCE,
];

/** True when the role's reach is defined by this module rather than being platform-wide. */
export function isScopedRole(role: AdminRole): boolean {
  return role === AdminRole.SERVICE_ADMIN || role in ROLE_VERTICALS;
}

/**
 * The verticals this admin may reach, or `null` for "every vertical" — the unscoped case, which is
 * kept distinct from an empty list on purpose. A SERVICE_ADMIN with no scopes configured yet reaches
 * nothing rather than everything: an unconfigured scope must fail closed.
 */
export function allowedVerticals(admin: Pick<ResolvedAdminContext, "role" | "serviceScopes">): AdminVertical[] | null {
  if (admin.role === AdminRole.SERVICE_ADMIN) {
    return admin.serviceScopes.filter((scope) => SERVICE_VERTICALS.includes(scope));
  }
  return ROLE_VERTICALS[admin.role] ?? null;
}

/** Whether this admin may act on rows belonging to `vertical`. */
export function canReachVertical(admin: Pick<ResolvedAdminContext, "role" | "serviceScopes">, vertical: AdminVertical): boolean {
  const allowed = allowedVerticals(admin);
  return allowed === null || allowed.includes(vertical);
}
