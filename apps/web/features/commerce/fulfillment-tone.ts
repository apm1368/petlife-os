/** Shared visual tone mapping for a FulfillmentStatus badge (Handoff 08) — never color-only (paired with translated text everywhere it's used). */
export function fulfillmentTone(status: string): "success" | "urgent" | "neutral" {
  if (status === "DELIVERED") return "success";
  if (status === "FAILED" || status === "CANCELED") return "urgent";
  return "neutral";
}
