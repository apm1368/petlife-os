import type { AppEnv } from "../../config/env";

export type SettingCategory = "platform" | "booking" | "commerce" | "approvals" | "support" | "content" | "notifications" | "privacy" | "country" | "auth" | "site" | "social" | "features" | "maintenance";
export type SettingType = "integer" | "boolean" | "localizedText" | "text" | "url" | "email" | "enum";
/** Locales a localizedText value may carry. Older values hold fa/en only and stay valid. */
export const SETTING_LOCALES = ["fa", "en", "de", "es", "ar", "nl"] as const;
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
  /** For "enum": the accepted values. */
  options?: readonly string[];
  /** For "text": an optional pattern the trimmed value must match. */
  pattern?: RegExp;
  /** The value used while no override is stored — an env value where one already existed, so behaviour is unchanged. */
  fallback: (env: (k: keyof AppEnv) => unknown) => unknown;
  description: string;
}


const publicText = (key: string, category: SettingCategory, maxLength: number, description: string): SettingDefinition => ({
  key, category, type: "localizedText", scope: "PUBLIC", highImpact: false, maxLength, fallback: () => null, description,
});
const publicUrl = (key: string, description: string): SettingDefinition => ({
  key, category: "social", type: "url", scope: "PUBLIC", highImpact: false, maxLength: 300, fallback: () => null, description,
});
const feature = (key: string, description: string): SettingDefinition => ({
  key, category: "features", type: "boolean", scope: "PUBLIC", highImpact: false, fallback: () => true, description,
});

/**
 * Site-wide public configuration the web app reads from GET /settings/public: identity, contact, social links,
 * maintenance mode, and which product areas appear in navigation. Each key has a consumer in apps/web
 * (features/site-settings); none is a decorative control.
 */
const SITE_SETTINGS: SettingDefinition[] = [
  publicText("site.tagline", "site", 160, "Short line under the logo in the footer."),
  publicText("site.footerNote", "site", 240, "Extra footer text (legal name, registration number, copyright)."),
  { key: "site.contactEmail", category: "site", type: "email", scope: "PUBLIC", highImpact: false, maxLength: 120, fallback: () => null, description: "Public contact email shown in the footer and on the contact page." },
  { key: "site.contactPhone", category: "site", type: "text", scope: "PUBLIC", highImpact: false, maxLength: 30, pattern: /^[+0-9۰-۹\s()-]{5,30}$/, fallback: () => null, description: "Public support phone number." },
  publicText("site.contactAddress", "site", 240, "Postal address shown on the contact page."),
  publicText("site.workingHours", "site", 160, "Support hours shown next to the phone number."),
  publicUrl("social.instagram", "Instagram page URL."),
  publicUrl("social.telegram", "Telegram channel URL."),
  publicUrl("social.whatsapp", "WhatsApp contact URL."),
  publicUrl("social.x", "X (Twitter) profile URL."),
  publicUrl("social.linkedin", "LinkedIn page URL."),
  publicUrl("social.youtube", "YouTube channel URL."),
  publicUrl("social.aparat", "Aparat channel URL."),
  { key: "maintenance.enabled", category: "maintenance", type: "boolean", scope: "PUBLIC", highImpact: true, fallback: () => false, description: "Show the maintenance screen to visitors and members. Admin, sign-in and the status page stay reachable." },
  publicText("maintenance.message", "maintenance", 400, "Message on the maintenance screen."),
  feature("features.shop", "Show the shop (products, cart, orders) in navigation."),
  feature("features.services", "Show care services and bookings in navigation."),
  feature("features.travel", "Show travel and stays in navigation."),
  feature("features.insurance", "Show insurance in navigation."),
  feature("features.places", "Show pet-friendly places in navigation."),
  feature("features.community", "Show the community in navigation."),
  feature("features.lostPets", "Show lost and found pets in navigation."),
  feature("features.animalSupport", "Show animal support and donations in navigation."),
  feature("features.blog", "Show the magazine and guides in navigation."),
  feature("features.memorials", "Show pet memorials in navigation."),
  { key: "auth.passwordSignupEnabled", category: "auth", type: "boolean", scope: "PUBLIC", highImpact: true, fallback: () => true, description: "Whether new accounts can be created with a username and password. Existing members can still sign in." },
];

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
    description: "Site-wide notice (fa/en/de/es). Empty = no banner.",
  },
  {
    key: "platform.announcementTone",
    category: "platform",
    type: "enum",
    scope: "PUBLIC",
    highImpact: false,
    options: ["info", "success", "warning", "urgent"],
    fallback: () => "info",
    description: "Colour of the announcement banner.",
  },
  {
    key: "platform.announcementLink",
    category: "platform",
    type: "url",
    scope: "PUBLIC",
    highImpact: false,
    maxLength: 300,
    fallback: () => null,
    description: "Optional link the announcement opens (site path like /shop or a full https URL).",
  },
  {
    key: "platform.announcementAudience",
    category: "platform",
    type: "enum",
    scope: "PUBLIC",
    highImpact: false,
    options: ["members", "everyone"],
    fallback: () => "members",
    description: "Who sees the announcement: signed-in members only, or every visitor.",
  },
  ...SITE_SETTINGS,
  {
    key: "auth.googleEnabled",
    category: "auth",
    type: "boolean",
    scope: "INTERNAL",
    highImpact: true,
    fallback: (env) => Boolean(env("GOOGLE_AUTH_ENABLED")),
    description: "Whether Google sign-in is available. Google credentials stay in the server environment and are never stored here.",
  },
  {
    key: "auth.otpEnabled",
    category: "auth",
    type: "boolean",
    scope: "INTERNAL",
    highImpact: true,
    fallback: () => true,
    description: "Whether phone OTP sign-in and verification is available. Delivery-provider credentials stay in the server environment.",
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
  // Approval modes (owner request 2026-11-13). Read by ApprovalPolicyService; a per-partner override
  // (PartnerApprovalOverride, admin partner profile) wins over these. The defaults are today's behaviour.
  {
    key: "approvals.mode.serviceBookings",
    category: "approvals",
    type: "enum",
    scope: "INTERNAL",
    highImpact: false,
    options: ["PARTNER_CHOICE", "INSTANT", "NEEDS_APPROVAL"],
    fallback: () => "PARTNER_CHOICE",
    description: "Care-service bookings: each provider's own per-service choice, always instant, or always a request the provider must accept (with a follow-up task for staff). Pet-taxi dispatch is not affected.",
  },
  {
    key: "approvals.mode.stayBookings",
    category: "approvals",
    type: "enum",
    scope: "INTERNAL",
    highImpact: false,
    options: ["PARTNER_CHOICE", "INSTANT", "NEEDS_APPROVAL"],
    fallback: () => "PARTNER_CHOICE",
    description: "Stay bookings: each listing's own choice, always instant, or always a request the host must accept (with a follow-up task for staff).",
  },
  {
    key: "approvals.mode.shopOrders",
    category: "approvals",
    type: "enum",
    scope: "INTERNAL",
    highImpact: false,
    options: ["INSTANT", "NEEDS_APPROVAL"],
    fallback: () => "INSTANT",
    description: "Shop orders: go to the seller as soon as they are paid, or wait for staff approval first (approve sends them to the seller; reject refunds in full).",
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
    key: "trust.highSeveritySlaHours",
    category: "support",
    type: "integer",
    scope: "INTERNAL",
    highImpact: false,
    min: 1,
    max: 72,
    fallback: () => 4,
    description: "Trust & Safety: target hours to handle HIGH/CRITICAL reports and cases; drives the unified queue's breach flags.",
  },
  {
    key: "trust.standardSlaHours",
    category: "support",
    type: "integer",
    scope: "INTERNAL",
    highImpact: false,
    min: 1,
    max: 336,
    fallback: () => 48,
    description: "Trust & Safety: target hours to handle LOW/MEDIUM reports, cases and appeals in the unified queue.",
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
const SAFE_URL = /^(https:\/\/[^\s<>"']+|\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]*)$/;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export function validateSettingValue(def: SettingDefinition, value: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (def.type === "text" || def.type === "url" || def.type === "email") {
    if (value === null || value === "") return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false, reason: "TEXT_REQUIRED" };
    const text = value.trim();
    if (text.length > (def.maxLength ?? 280)) return { ok: false, reason: "TOO_LONG" };
    if (def.type === "url" && !SAFE_URL.test(text)) return { ok: false, reason: "URL_INVALID" };
    if (def.type === "email" && !EMAIL.test(text)) return { ok: false, reason: "EMAIL_INVALID" };
    if (def.type === "text" && def.pattern && !def.pattern.test(text)) return { ok: false, reason: "FORMAT_INVALID" };
    return { ok: true, value: text || null };
  }
  if (def.type === "enum") {
    return typeof value === "string" && (def.options ?? []).includes(value) ? { ok: true, value } : { ok: false, reason: "OPTION_INVALID" };
  }
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
  const extra = Object.keys(v).filter((k) => !(SETTING_LOCALES as readonly string[]).includes(k));
  if (extra.length) return { ok: false, reason: "UNKNOWN_LOCALE" };
  const out: Record<string, string> = {};
  for (const locale of SETTING_LOCALES) {
    const text = v[locale];
    if (text === undefined || text === null || text === "") continue;
    if (typeof text !== "string") return { ok: false, reason: "LOCALIZED_TEXT_REQUIRED" };
    if (text.length > (def.maxLength ?? 280)) return { ok: false, reason: "TOO_LONG" };
    out[locale] = text.trim();
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}
