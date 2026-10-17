export type Freshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

/** ≤ freshHours FRESH, ≤ agingHours AGING, older STALE, never observed UNKNOWN. Never implies real time. */
export function freshnessOf(observedAt: Date | null | undefined, cfg: { priceFreshHours: number; priceAgingHours: number }, now = new Date()): Freshness {
  if (!observedAt) return "UNKNOWN";
  const h = (now.getTime() - observedAt.getTime()) / 3600e3;
  return h <= cfg.priceFreshHours ? "FRESH" : h <= cfg.priceAgingHours ? "AGING" : "STALE";
}
