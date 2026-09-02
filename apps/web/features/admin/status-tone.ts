import type { StatusTone } from "@petlife/ui";

/** A single generic status->tone mapping reused across Support/Dispute/Trust/Refund status labels — mirrors commerce's own fulfillmentTone.ts precedent, generalized since these domains share the same rough OPEN/IN_PROGRESS/RESOLVED/REJECTED shape. */
export function adminStatusTone(status: string): StatusTone {
  if (["RESOLVED", "RESOLVED_CUSTOMER", "RESOLVED_PROVIDER", "RESOLVED_SELLER", "DONE", "APPROVED", "EXECUTED", "VERIFIED", "ACTIVE", "UPHELD"].includes(status)) return "success";
  if (["REJECTED", "CANCELLED", "SUSPENDED", "OVERTURNED", "URGENT", "CRITICAL", "HIGH"].includes(status)) return "urgent";
  if (["WAITING_ON_USER", "WAITING_ON_INTERNAL", "AWAITING_EVIDENCE", "UNDER_REVIEW", "PARTIAL_RESOLUTION", "PARTIALLY_OVERTURNED", "RESTRICTED"].includes(status)) return "attention";
  if (["CLOSED"].includes(status)) return "neutral";
  return "neutral";
}
