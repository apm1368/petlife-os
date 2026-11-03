import { createHash } from "node:crypto";

export interface FeatureFlagAudience {
  userId?: string | null;
  city?: string | null;
}

export interface FeatureFlagSnapshot {
  isEnabled: boolean;
  rolloutPercentage: number;
  cities: string[];
  betaUserIds: string[];
}

export type FeatureFlagEvaluation = {
  enabled: boolean;
  reason: "DISABLED" | "BETA_USER" | "CITY" | "ROLLOUT" | "NOT_TARGETED";
};

/**
 * A rollout must be stable: the same user sees the same decision for a given
 * flag, rather than bouncing in and out on consecutive requests.
 */
export function evaluateFeatureFlag(
  key: string,
  flag: FeatureFlagSnapshot,
  audience: FeatureFlagAudience = {},
): FeatureFlagEvaluation {
  if (!flag.isEnabled) return { enabled: false, reason: "DISABLED" };
  const userId = audience.userId?.trim();
  if (userId && flag.betaUserIds.includes(userId)) return { enabled: true, reason: "BETA_USER" };
  const city = audience.city?.trim().toLocaleLowerCase("fa-IR");
  if (city && flag.cities.some((value) => value.toLocaleLowerCase("fa-IR") === city))
    return { enabled: true, reason: "CITY" };
  if (flag.rolloutPercentage <= 0 || !userId) return { enabled: false, reason: "NOT_TARGETED" };
  if (flag.rolloutPercentage >= 100) return { enabled: true, reason: "ROLLOUT" };
  // Do not include the percentage in the hash. Raising 10% to 20% must keep
  // the original 10% cohort and add people, rather than reshuffling everyone.
  const bucket = createHash("sha256").update(`${key}:${userId}`).digest().readUInt32BE(0) % 100;
  return bucket < flag.rolloutPercentage
    ? { enabled: true, reason: "ROLLOUT" }
    : { enabled: false, reason: "NOT_TARGETED" };
}
