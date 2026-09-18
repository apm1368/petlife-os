/**
 * Display label for every entitlement key the API can hand back — the plan
 * catalog's own keys (`seed.ts`, and the default FREE plan the API
 * self-heals with), which is every key `UsageService.DERIVERS` meters plus
 * the boolean feature flags.
 *
 * Deliberately one shared map rather than a copy per view: the Overview and
 * Plans screens both render entitlement rows, and when a key has no entry
 * here they fall back to printing the *raw key* ("health.documents.max") at
 * the user. Keeping two copies is what let that happen for the keys added
 * after this map was first written, so new entitlement keys belong here
 * once, not in each view.
 */
export const ENTITLEMENT_LABEL_KEY: Record<string, string> = {
  "pets.max": "entitlement.petsMax",
  "household.members.max": "entitlement.membersMax",
  "premium.support": "entitlement.prioritySupport",
  "health.documents.max": "entitlement.healthDocumentsMax",
  "health.observations.max": "entitlement.healthObservationsMax",
  "memories.entries.max": "entitlement.memoriesMax",
};

/**
 * The label for an entitlement key, or `null` when none is known — callers
 * decide how to degrade, but must never print the raw key: it is an internal
 * identifier, not copy.
 */
export function entitlementLabelKey(key: string): string | null {
  return ENTITLEMENT_LABEL_KEY[key] ?? null;
}
