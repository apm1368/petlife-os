import type { StatusTone } from "@petlife/ui";
import type { UserFacingSupportCaseStatus } from "@petlife/types";

/** Tone mapping for the consumer-facing simplified status only — never the raw admin SupportCaseStatus (see admin/status-tone.ts for that one). */
export function supportStatusTone(status: UserFacingSupportCaseStatus): StatusTone {
  switch (status) {
    case "RESOLVED":
      return "success";
    case "WAITING":
    case "UNDER_REVIEW":
      return "attention";
    case "CLOSED":
      return "neutral";
    case "SUBMITTED":
    default:
      return "neutral";
  }
}
