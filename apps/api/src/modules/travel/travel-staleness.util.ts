/**
 * A requirement is stale when it has never been verified, its verification
 * is older than the threshold, or its own validUntil has passed — the UI
 * must surface this rather than hide it (spec: "do not hide stale data").
 */
const STALE_AFTER_DAYS = 180;

export function isTravelRequirementStale(verifiedAt: Date | null, validUntil: Date | null): boolean {
  if (!verifiedAt) return true;
  const ageMs = Date.now() - verifiedAt.getTime();
  if (ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000) return true;
  if (validUntil && validUntil.getTime() < Date.now()) return true;
  return false;
}
