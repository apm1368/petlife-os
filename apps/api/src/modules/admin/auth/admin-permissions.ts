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
  | "admin.manage"
  | "sellerFinance.view"
  | "settlement.calculate"
  | "settlement.approve"
  | "settlement.pay"
  | "settlement.adjust"
  | "content.view"
  | "content.create"
  | "content.edit"
  | "content.publish"
  | "content.archive"
  | "content.media.manage"
  | "subscription.view"
  | "subscription.manage"
  | "subscription.plan.manage"
  | "subscription.entitlement.override"
  | "animalSupport.view"
  | "animalSupport.manage"
  | "animalSupport.payout"
  | "insurance.view"
  | "insurance.manage"
  | "places.view"
  | "places.manage";

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
  "sellerFinance.view",
  "settlement.calculate",
  "settlement.approve",
  "settlement.pay",
  "settlement.adjust",
  "content.view",
  "content.create",
  "content.edit",
  "content.publish",
  "content.archive",
  "content.media.manage",
  "subscription.view",
  "subscription.manage",
  "subscription.plan.manage",
  "subscription.entitlement.override",
  "animalSupport.view",
  "animalSupport.manage",
  "animalSupport.payout",
  "insurance.view",
  "insurance.manage",
  "places.view",
  "places.manage",
];

const READ_ONLY_PERMISSIONS: AdminPermission[] = [
  "customer.view",
  "support.view",
  "dispute.view",
  "trust.view",
  "finance.view",
  "audit.view",
  "sellerFinance.view",
  "content.view",
  "subscription.view",
  "animalSupport.view",
  "insurance.view",
  "places.view",
];

/**
 * Least-privilege by construction (spec: "do not make every admin
 * all-powerful") — every role below SUPER_ADMIN is missing at least one
 * permission SUPER_ADMIN has, and `admin.manage` (granting/suspending other
 * admins) is SUPER_ADMIN-only, never delegated even to ADMIN.
 */
// spec: "manual entitlement overrides... use only with appropriate
// permission... be careful with manual overrides." `subscription.entitlement
// .override` is deliberately SUPER_ADMIN-only — not even ADMIN — since it
// bypasses the actual paid-plan mechanics for one household; every other
// subscription.* permission follows the normal ADMIN/SUPER_ADMIN split.
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
    "sellerFinance.view",
    "settlement.calculate",
    "settlement.approve",
    "settlement.adjust",
    "content.view",
    "content.create",
    "content.edit",
    "content.publish",
    "content.archive",
    "content.media.manage",
    "subscription.view",
    "subscription.manage",
    "subscription.plan.manage",
    "animalSupport.view",
    "animalSupport.manage",
    "insurance.view",
    "insurance.manage",
    "places.view",
    "places.manage",
  ],
  // spec: "SUPPORT: view may be allowed if needed, manage should NOT be
  // granted by default" — SUPPORT can see a household's subscription state
  // (needed for the H13 support context panel) but can never cancel, grant
  // a trial, or override an entitlement.
  [AdminRole.SUPPORT]: ["customer.view", "support.view", "support.manage", "dispute.view", "dispute.manage", "task.manage", "subscription.view"],
  [AdminRole.TRUST_SAFETY]: ["customer.view", "customer.pii.reveal", "support.view", "dispute.view", "dispute.manage", "trust.view", "trust.manage", "task.manage"],
  // Payout execution ("settlement.pay") is FINANCE-only, mirroring
  // finance.refund.execute's own "ADMIN can approve, only FINANCE can move
  // real money" precedent exactly (spec: "do not give SUPPORT role
  // settlement authority" — FINANCE is the only role with the full set).
  [AdminRole.FINANCE]: [
    "customer.view",
    "finance.view",
    "finance.refund.request",
    "finance.refund.approve",
    "finance.refund.execute",
    "audit.view",
    "sellerFinance.view",
    "settlement.calculate",
    "settlement.approve",
    "settlement.pay",
    "settlement.adjust",
    // spec: "FINANCE: appropriate billing visibility" — read-only; plan/price
    // management and subscription mutations stay ADMIN/SUPER_ADMIN-only.
    "subscription.view",
    // Donation payout mirrors settlement.pay's own "only FINANCE moves real
    // money" precedent exactly — ADMIN can verify/approve, only FINANCE
    // records an actual fund payout.
    "animalSupport.view",
    "animalSupport.payout",
  ],
  [AdminRole.OPERATIONS]: [
    "customer.view",
    "support.view",
    "dispute.view",
    "trust.view",
    "finance.view",
    "task.manage",
    "audit.view",
    "sellerFinance.view",
    "content.view",
    "subscription.view",
    "animalSupport.view",
    "insurance.view",
    "insurance.manage",
    "places.view",
    "places.manage",
  ],
  // Content moderation subjects (LISTING/REVIEW/COMMUNITY_CONTENT) are a
  // subset of TrustSubjectType — this phase does not further restrict
  // CONTENT to only those subject types at the permission-map level (see
  // README "Known limitations"); it is scoped to trust operations only,
  // never finance/verification/support-case management.
  [AdminRole.CONTENT]: ["trust.view", "trust.manage", "task.manage"],
  [AdminRole.VERIFICATION]: ["customer.view", "verification.manage", "task.manage"],
  [AdminRole.READ_ONLY]: READ_ONLY_PERMISSIONS,
  // The Handoff 15 CMS editorial role — distinct from the pre-existing
  // AdminRole.CONTENT above (trust-and-safety content moderation, see its
  // own comment). Deliberately excludes content.publish/content.archive:
  // an editor can draft, edit, and manage media, but "editing and
  // publishing should be separate actions" (spec) — only ADMIN/SUPER_ADMIN
  // can actually make a locale VISIBLE or ARCHIVED, mirroring the exact
  // "broad drafting, narrower execution" shape finance.refund.request
  // (broad) vs. finance.refund.execute (FINANCE-only) already established.
  [AdminRole.EDITOR]: ["content.view", "content.create", "content.edit", "content.media.manage"],
};

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
