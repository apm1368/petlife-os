import type { StatusTone } from "@petlife/ui";
import type { TravelRequirementStatus, TripStatus } from "@petlife/types";

export function tripStatusTone(status: TripStatus): StatusTone {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "PLANNING":
      return "attention";
    case "READY":
      return "success";
    case "IN_PROGRESS":
      return "attention";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    default:
      return "neutral";
  }
}

/** UNKNOWN/REQUIRED/INCOMPLETE never read as "done" (locked rule: unknown never becomes ready) — only READY/NOT_REQUIRED read calm. */
export function requirementStatusTone(status: TravelRequirementStatus): StatusTone {
  switch (status) {
    case "READY":
    case "NOT_REQUIRED":
      return "success";
    case "REQUIRED":
      return "attention";
    case "INCOMPLETE":
      return "attention";
    case "UNKNOWN":
    default:
      return "neutral";
  }
}
