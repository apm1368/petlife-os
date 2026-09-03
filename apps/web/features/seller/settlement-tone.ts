import type { StatusTone } from "@petlife/ui";

/** Shared status->tone mapping for SellerSettlementDto.status, used by both the seller and admin finance views so the same status always reads the same visual weight. */
export function settlementTone(status: string): StatusTone {
  switch (status) {
    case "PAID":
      return "success";
    case "APPROVED":
      return "attention";
    case "FAILED":
      return "urgent";
    case "RECONCILIATION_REQUIRED":
      return "higherConcern";
    case "CALCULATED":
    case "CANCELLED":
    default:
      return "neutral";
  }
}
