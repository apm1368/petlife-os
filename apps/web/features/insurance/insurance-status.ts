import type { StatusTone } from "@petlife/ui";
import type { InsuranceApplicationStatus, InsuranceEligibilityStatus, InsuranceVerificationStatus } from "@petlife/types";

export function verificationStatusTone(status: InsuranceVerificationStatus): StatusTone {
  switch (status) {
    case "VERIFIED":
      return "success";
    case "SUSPENDED":
      return "urgent";
    case "UNVERIFIED":
    default:
      return "neutral";
  }
}

/** POSSIBLY_ELIGIBLE and UNKNOWN never read as a guarantee (spec's locked rule) — only ELIGIBLE reads calm. */
export function eligibilityStatusTone(status: InsuranceEligibilityStatus): StatusTone {
  switch (status) {
    case "ELIGIBLE":
      return "success";
    case "POSSIBLY_ELIGIBLE":
      return "attention";
    case "NOT_ELIGIBLE":
      return "urgent";
    case "UNKNOWN":
    default:
      return "neutral";
  }
}

export function applicationStatusTone(status: InsuranceApplicationStatus): StatusTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "DECLINED":
    case "CANCELLED":
      return "neutral";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "attention";
    case "DRAFT":
    default:
      return "neutral";
  }
}
