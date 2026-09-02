import { AdminRole } from "@prisma/client";

/**
 * The complete internal-platform permission vocabulary. This is a
 * TypeScript-only union, never a Postgres enum or a DB-stored row — mirrors
 * PROVIDER_CAPABILITIES/SHIPPING_PROVIDER_CAPABILITIES's own "static map,
 * not a table" precedent (see the AdminRole model doc comment in
 * schema.prisma). Backend authorization (AdminAuthGuard +
 * RequireAdminPermission) is the source of truth; the admin frontend may use
 * this same list to hide controls, but hiding a button is never itself a
 * security boundary.
 */
export type AdminPermission =
  | "customer.view"
  | "customer.pii.reveal"
  | "support.view"
  | "support.manage"
  | "dispute.view"
  | "dispute.manage"
  | "trust.view"
  | "trust.manage"
  | "verification.manage"
  | "finance.view"
  | "finance.refund.request"
  | "finance.refund.approve"
  | "finance.refund.execute"
  | "task.manage"
  | "audit.view"
  | "admin.manage";

const ALL_PERMISSIONS: AdminPermission[] = [
  "customer.view",
  "customer.pii.reveal",
  "support.view",
  "support.manage",
  "dispute.view",
  "dispute.manage",
  "trust.view",
  "trust.manage",
  "verification.manage",
  "finance.view",
  "finance.refund.request",
  "finance.refund.approve",
  "finance.refund.execute",
  "task.manage",
  "audit.view",
  "admin.manage",
];

const READ_ONLY_PERMISSIONS: AdminPermission[] = ["customer.view", "support.view", "dispute.view", "trust.view", "finance.view", "audit.view"];

/**
 * Least-privilege by construction (spec: "do not make every admin
 * all-powerful") — every role below SUPER_ADMIN is missing at least one
 * permission SUPER_ADMIN has, and `admin.manage` (granting/suspending other
 * admins) is SUPER_ADMIN-only, never delegated even to ADMIN.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  [AdminRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [AdminRole.ADMIN]: [
    "customer.view",
    "customer.pii.reveal",
    "support.view",
    "support.manage",
    "dispute.view",
    "dispute.manage",
    "trust.view",
    "trust.manage",
    "verification.manage",
    "finance.view",
    "finance.refund.request",
    "finance.refund.approve",
    "task.manage",
    "audit.view",
  ],
  [AdminRole.SUPPORT]: ["customer.view", "support.view", "support.manage", "dispute.view", "dispute.manage", "task.manage"],
  [AdminRole.TRUST_SAFETY]: ["customer.view", "customer.pii.reveal", "support.view", "dispute.view", "dispute.manage", "trust.view", "trust.manage", "task.manage"],
  [AdminRole.FINANCE]: ["customer.view", "finance.view", "finance.refund.request", "finance.refund.approve", "finance.refund.execute", "audit.view"],
  [AdminRole.OPERATIONS]: ["customer.view", "support.view", "dispute.view", "trust.view", "finance.view", "task.manage", "audit.view"],
  // Content moderation subjects (LISTING/REVIEW/COMMUNITY_CONTENT) are a
  // subset of TrustSubjectType — this phase does not further restrict
  // CONTENT to only those subject types at the permission-map level (see
  // README "Known limitations"); it is scoped to trust operations only,
  // never finance/verification/support-case management.
  [AdminRole.CONTENT]: ["trust.view", "trust.manage", "task.manage"],
  [AdminRole.VERIFICATION]: ["customer.view", "verification.manage", "task.manage"],
  [AdminRole.READ_ONLY]: READ_ONLY_PERMISSIONS,
};

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
