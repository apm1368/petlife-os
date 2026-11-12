import type { AdminOrderSection } from "@petlife/types";

/** URL slug ↔ section (admin/orders/<slug>). */
export const SECTION_SLUGS: Record<AdminOrderSection, string> = {
  SHOP: "shop",
  SERVICES: "services",
  PET_TAXI: "pet-taxi",
  TRAVEL: "travel",
  DONATIONS: "donations",
  SUBSCRIPTIONS: "subscriptions",
};
export const sectionOfSlug = (slug: string): AdminOrderSection | null =>
  (Object.entries(SECTION_SLUGS).find(([, s]) => s === slug)?.[0] as AdminOrderSection | undefined) ?? null;

/** Each section's own statuses, in lifecycle order, for the status filter on its tab. */
export const SECTION_STATUSES: Record<AdminOrderSection, string[]> = {
  SHOP: ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_FULFILLMENT", "FULFILLED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"],
  SERVICES: ["HOLD", "REQUESTED", "PENDING_CONFIRMATION", "AWAITING_PAYMENT", "CONFIRMED", "RESCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "REJECTED", "EXPIRED", "CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER"],
  PET_TAXI: ["SEARCHING", "DRIVER_ASSIGNED", "ARRIVING", "PICKED_UP", "COMPLETED", "CANCELLED_BY_MEMBER", "CANCELLED_BY_DRIVER", "NO_DRIVER"],
  TRAVEL: ["DRAFT", "HELD", "AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "MODIFIED", "CANCELLED", "REJECTED", "EXPIRED", "REFUNDED"],
  DONATIONS: ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"],
  SUBSCRIPTIONS: ["PENDING", "SUCCEEDED", "FAILED"],
};
export const PAYMENT_STATES = ["PAID", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED", "ON_ARRIVAL", "NOT_REQUIRED", "UNKNOWN"] as const;
export const STAGES = ["OPEN", "COMPLETED", "CANCELLED"] as const;
