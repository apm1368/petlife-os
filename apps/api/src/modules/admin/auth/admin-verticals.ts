import { AdminRole, AdminVertical, ProviderType } from "@prisma/client";
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

/**
 * Which provider-organization types each service vertical covers. This is the row-level half of the
 * scoping story: the services surface (bookings, provider services, provider reviews, waitlist,
 * analytics) shares one controller across clinic, grooming and stay providers, so a controller-level
 * vertical gate cannot tell a GROOMING admin's rows from a CLINIC admin's — they must be separated in
 * the query predicate by the organization's ProviderType.
 *
 * A vertical missing from this map (INSURANCE, which lives on InsuranceProvider under its own
 * controller) contributes no provider type, so a SERVICE_ADMIN scoped only to it sees no provider
 * services at all — fail closed, by construction. Provider types that belong to no service vertical
 * (TRAINER, WALKER, PET_TAXI, MULTI_SERVICE_PROVIDER) are reachable only by an unscoped role.
 */
const VERTICAL_PROVIDER_TYPES: Partial<Record<AdminVertical, ProviderType[]>> = {
  [AdminVertical.CLINIC]: [ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL, ProviderType.VETERINARIAN],
  [AdminVertical.GROOMING]: [ProviderType.GROOMER],
  [AdminVertical.ACCOMMODATION]: [ProviderType.TRAVEL_ACCOMMODATION, ProviderType.BOARDING, ProviderType.SITTER],
};

/**
 * The provider-organization types this admin may see under the services surface, or `null` for every
 * type (an unscoped role). A scoped role whose verticals map to no provider type returns `[]`, which
 * callers must treat as "no rows", never "all rows".
 */
export function allowedProviderTypes(admin: Pick<ResolvedAdminContext, "role" | "serviceScopes">): ProviderType[] | null {
  const verticals = allowedVerticals(admin);
  if (verticals === null) return null;
  return [...new Set(verticals.flatMap((v) => VERTICAL_PROVIDER_TYPES[v] ?? []))];
}

/** True when this admin may act on a provider organization of the given type. */
export function canReachProviderType(admin: Pick<ResolvedAdminContext, "role" | "serviceScopes">, type: ProviderType): boolean {
  const allowed = allowedProviderTypes(admin);
  return allowed === null || allowed.includes(type);
}
