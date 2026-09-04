import type { StatusTone } from "@petlife/ui";
import type { LostPetIncidentStatus } from "@petlife/types";

/** spec: "urgent but controlled... avoid panic-red everywhere" — only OPEN/SEARCHING/SIGHTING_REPORTED read as attention-worthy; REUNITED is the one genuinely celebratory state. */
export function lostPetStatusTone(status: LostPetIncidentStatus): StatusTone {
  switch (status) {
    case "OPEN":
      return "urgent";
    case "SEARCHING":
    case "SIGHTING_REPORTED":
      return "attention";
    case "FOUND":
      return "success";
    case "REUNITED":
      return "success";
    case "CLOSED":
    default:
      return "neutral";
  }
}
