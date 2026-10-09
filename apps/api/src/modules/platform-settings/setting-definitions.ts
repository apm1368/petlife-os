import type { AppEnv } from "../../config/env";

export type SettingCategory = "platform" | "booking" | "commerce" | "support" | "content" | "notifications" | "privacy" | "country";
export type SettingType = "integer" | "boolean" | "localizedText";
export type SettingScope = "PUBLIC" | "INTERNAL";

export interface SettingDefinition {
  key: string;
  category: SettingCategory;
  type: SettingType;
  /** PUBLIC settings are readable without a session (GET /settings/public); INTERNAL never leave the admin API. */
  scope: SettingScope;
  /** High-impact keys need a second admin (settings.approve, not the requester) before they take effect. */
  highImpact: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  /** The value used while no override is stored — an env value where one already existed, so behaviour is unchanged. */
  fallback: (env: (k: keyof AppEnv) => unknown) => unknown;
  description: string;
}

/**
 * The explicit registry. Only keys that something actually reads are listed — a setting nobody consumes would be a
 * fake control. Secrets, credentials and provider modes are deliberately NOT settings (they stay in the server env).
 */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "platform.announcement",
    category: "platform",
    type: "localizedText",
    scope: "PUBLIC",
    highImpact: false,
    maxLength: 280,
    fallback: () => null,
    description: "Site-wide notice shown to members (fa/en). Empty = no banner.",
  },
  {
    key: "booking.holdTtlSeconds",
    category: "booking",
    type: "integer",
    scope: "INTERNAL",
    highImpact: true,
    min: 120,
    max: 1800,
    fallback: (env) => env("BOOKING_HOLD_TTL_SECONDS"),
    description: "How long a slot stays reserved while the member completes a booking.",
  },
  {
    key: "commerce.refundApprovalThresholdIrr",
    category: "commerce",
    type: "integer",
    scope: "INTERNAL",
    highImpact: true,
    min: 0,
    max: 2_000_000_000,
    fallback: (env) => env("ADMIN_REFUND_APPROVAL_THRESHOLD_IRR"),
    description: "Admin refunds at or above this amount need a second admin's approval before execution.",
  },
  {
    key: "commerce.settlementApprovalThresholdIrr",
    category: "commerce",
    type: "integer",
    scope: "INTERNAL",
    highImpact: true,
    min: 0,
    max: 2_000_000_000,
    fallback: (env) => env("SETTLEMENT_APPROVAL_THRESHOLD_IRR"),
    description: "Seller settlements at or above this net amount need approval before payout.",
  },
  {
    key: "support.firstResponseSlaHours",
    category: "support",
    type: "integer",
    scope: "INTERNAL",
    highImpact: false,
    min: 1,
    max: 168,
    fallback: () => 24,
    description: "Target hours to the first staff reply on a support case; used by SLA metrics and breach flags.",
  },
  {
    key: "privacy.exportsPerDay",
    category: "privacy",
    type: "integer",
    scope: "INTERNAL",
    highImpact: false,
    min: 1,
    max: 10,
    fallback: () => 3,
    description: "How many data-export requests one member can make per day.",
  },
];

export const SETTING_KEYS = SETTING_DEFINITIONS.map((d) => d.key);
export function settingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((d) => d.key === key);
}

/** Returns a normalised value, or a reason the value is not acceptable for this definition. */
export function validateSettingValue(def: SettingDefinition, value: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (def.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false, reason: "INTEGER_REQUIRED" };
    if (def.min !== undefined && value < def.min) return { ok: false, reason: "BELOW_MIN" };
    if (def.max !== undefined && value > def.max) return { ok: false, reason: "ABOVE_MAX" };
    return { ok: true, value };
  }
  if (def.type === "boolean") return typeof value === "boolean" ? { ok: true, value } : { ok: false, reason: "BOOLEAN_REQUIRED" };
  // localizedText: null clears it; otherwise { fa, en } with at least one non-empty string.
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "LOCALIZED_TEXT_REQUIRED" };
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter((k) => k !== "fa" && k !== "en");
  if (extra.length) return { ok: false, reason: "UNKNOWN_LOCALE" };
  const out: Record<string, string> = {};
  for (const locale of ["fa", "en"] as const) {
    const text = v[locale];
    if (text === undefined || text === null || text === "") continue;
    if (typeof text !== "string") return { ok: false, reason: "LOCALIZED_TEXT_REQUIRED" };
    if (text.length > (def.maxLength ?? 280)) return { ok: false, reason: "TOO_LONG" };
    out[locale] = text.trim();
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}
