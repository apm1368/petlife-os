import { stable } from "./fingerprint";

/** Fields whose changes are recorded in listing history (old value, new value, run). */
export const TRACKED_FIELDS = ["title", "descriptionSummary", "imageUrls", "city", "province", "area", "addressText", "latitude", "longitude", "amenities", "capacity", "stayType", "petPolicyStatus"] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

export function diffFields(before: Partial<Record<TrackedField, unknown>>, after: Partial<Record<TrackedField, unknown>>): { field: TrackedField; oldValue: unknown; newValue: unknown }[] {
  const out: { field: TrackedField; oldValue: unknown; newValue: unknown }[] = [];
  for (const f of TRACKED_FIELDS) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (JSON.stringify(stable(a)) !== JSON.stringify(stable(b))) out.push({ field: f, oldValue: a, newValue: b });
  }
  return out;
}
