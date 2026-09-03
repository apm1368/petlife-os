import { loadEnv, z } from "@petlife/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  WEB_APP_ORIGIN: z.string().min(1),

  SESSION_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().default("petlife_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CSRF_SECRET: z.string().min(16),

  OTP_PROVIDER: z.enum(["dev"]).default("dev"),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  /// Authentication (Handoff 12) — Google OAuth follows the exact same
  /// "*_ENABLED flag, optional credentials, validated at startup" shape as
  /// every other external provider in this codebase (Payment/Shipping/
  /// Marketplace/Messaging). Unlike those, there is no sandbox mode: Google
  /// sign-in is either off (GOOGLE_AUTH_ENABLED=false, the default — the
  /// rest of the app keeps working, per spec) or genuinely configured with
  /// real OAuth client credentials; there is no safe "simulate a real
  /// Google login" sandbox the way DevPaymentGateway can safely simulate a
  /// card charge, so dev/test coverage instead goes through the dedicated
  /// dev-only /dev/auth/google/simulate endpoint (see AuthGoogleController).
  /// z.coerce.boolean() would treat the *string* "false" as truthy (any
  /// non-empty string coerces to true) — every other *_ENABLED flag in this
  /// schema happens to only ever be set to "true" in .env, so that footgun
  /// has never surfaced before now. This is the one flag actually set to
  /// "false" in .env (Google is off by default), so it needs a real
  /// string-literal parse instead.
  GOOGLE_AUTH_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  /// Argon2id password hashing (see common/password/password-hash.util.ts).
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(8),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_S3_ENDPOINT: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().default("./local-storage"),
  STORAGE_PUBLIC_BASE_URL: z.string().default("http://localhost:4000/uploads"),

  /// How long a Redis-backed slot hold (POST /booking-holds) stays valid
  /// before it silently expires and the slot becomes bookable by anyone
  /// again. 10 minutes — long enough to fill in a reason-for-visit and
  /// review health sharing without feeling rushed, short enough that an
  /// abandoned hold doesn't block a popular slot for long.
  BOOKING_HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  /// How long after a booking's scheduled end time its TEMPORARY health
  /// access grant remains valid — covers a same-day follow-up note from the
  /// vet after the appointment itself has ended.
  BOOKING_HEALTH_ACCESS_BUFFER_HOURS: z.coerce.number().int().positive().default(24),

  /// Real Payments + BNPL (Handoff 07). "sandbox" is the only mode this
  /// project can ever safely run in — no real merchant credentials exist
  /// for any provider (see README "Provider documentation safety"), so
  /// "production" is validated (see validateEnv below) rather than merely
  /// documented, precisely to prevent ever calling a real endpoint that was
  /// never actually wired up.
  PAYMENT_SANDBOX_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  STANDARD_GATEWAY_ENABLED: z.coerce.boolean().default(true),
  SNAPPAY_ENABLED: z.coerce.boolean().default(true),
  DIGIPAY_ENABLED: z.coerce.boolean().default(true),
  /// Optional and unused by the sandbox-stub adapters — present only so a
  /// real integration has a place to read credentials from without a schema
  /// change, and so startup validation can require them in "production" mode.
  STANDARD_GATEWAY_MERCHANT_ID: z.string().optional(),
  STANDARD_GATEWAY_API_KEY: z.string().optional(),
  SNAPPAY_MERCHANT_ID: z.string().optional(),
  SNAPPAY_API_KEY: z.string().optional(),
  DIGIPAY_MERCHANT_ID: z.string().optional(),
  DIGIPAY_API_KEY: z.string().optional(),

  /// Delivery & Logistics Core (Handoff 08) — same "sandbox is always safe,
  /// production is validated" rule as PAYMENT_SANDBOX_MODE (see
  /// validateShippingConfig below): no official AloPeyk/SnappBox merchant
  /// credentials exist for this project (see README "Provider integration
  /// status"), so SHIPPING_MODE=production is rejected unless every enabled
  /// real provider's credentials are actually configured.
  SHIPPING_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  DEV_SHIPPING_ENABLED: z.coerce.boolean().default(true),
  ALOPEYK_ENABLED: z.coerce.boolean().default(true),
  SNAPPBOX_ENABLED: z.coerce.boolean().default(true),
  /// Optional and unused by the sandbox-stub adapters — present only so a
  /// real integration has a place to read credentials from without a schema
  /// change, and so startup validation can require them in "production" mode.
  ALOPEYK_API_BASE_URL: z.string().optional(),
  ALOPEYK_API_KEY: z.string().optional(),
  ALOPEYK_WEBHOOK_SECRET: z.string().optional(),
  SNAPPBOX_API_BASE_URL: z.string().optional(),
  SNAPPBOX_API_KEY: z.string().optional(),
  SNAPPBOX_WEBHOOK_SECRET: z.string().optional(),

  /// Seller OS + Marketplace Channel Integrations (Handoff 09) — same
  /// "sandbox is always safe, production is validated" rule as
  /// PAYMENT_SANDBOX_MODE/SHIPPING_MODE (see validateMarketplaceConfig
  /// below): no official Torob/Digikala merchant credentials exist for this
  /// project (see README "Provider integration status"), so
  /// MARKETPLACE_SANDBOX_MODE=production is rejected unless every enabled
  /// real provider's credentials are actually configured.
  MARKETPLACE_SANDBOX_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  DEV_MARKETPLACE_ENABLED: z.coerce.boolean().default(true),
  TOROB_ENABLED: z.coerce.boolean().default(true),
  DIGIKALA_ENABLED: z.coerce.boolean().default(true),
  /// Optional and unused by the sandbox-stub adapters — present only so a
  /// real integration has a place to read credentials from without a schema
  /// change, and so startup validation can require them in "production" mode.
  TOROB_BASE_URL: z.string().optional(),
  TOROB_API_KEY: z.string().optional(),
  DIGIKALA_BASE_URL: z.string().optional(),
  DIGIKALA_API_KEY: z.string().optional(),

  /// Messaging, Notifications & Preferences (Handoff 10) — same "sandbox is
  /// always safe, production is validated" rule as PAYMENT_SANDBOX_MODE/
  /// SHIPPING_MODE/MARKETPLACE_SANDBOX_MODE (see validateMessagingConfig
  /// below): no official Faraz SMS merchant credentials exist for this
  /// project (see README "Provider integration status"), so
  /// MESSAGING_SANDBOX_MODE=production is rejected unless Faraz is enabled
  /// with real credentials actually configured. MESSAGING_PROVIDER selects
  /// which gateway NotificationDeliveryService sends SMS through by
  /// default — "dev" locally/in tests, "faraz" once real credentials exist.
  MESSAGING_PROVIDER: z.enum(["dev", "faraz"]).default("dev"),
  MESSAGING_SANDBOX_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  DEV_MESSAGING_ENABLED: z.coerce.boolean().default(true),
  FARAZ_SMS_ENABLED: z.coerce.boolean().default(true),
  /// Optional and unused by the sandbox-stub adapter — present only so a
  /// real integration has a place to read credentials from without a schema
  /// change, and so startup validation can require them in "production" mode.
  FARAZ_SMS_BASE_URL: z.string().optional(),
  FARAZ_SMS_API_KEY: z.string().optional(),
  FARAZ_SMS_SENDER: z.string().optional(),
  /// How many times a TRANSIENT delivery failure is retried before the
  /// delivery is marked FAILED for good (spec: "do not infinitely retry").
  NOTIFICATION_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  /// How often the background delivery worker polls for due (scheduled or
  /// retry-eligible) NotificationDelivery rows. Irrelevant in test — the
  /// worker's interval never starts under NODE_ENV=test; tests call its
  /// processDueDeliveries() directly for determinism.
  NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  /// Admin CRM + Support + Disputes + Trust Operations (Handoff 11) —
  /// two-person control threshold for refund execution (spec: "refund
  /// above threshold -> REQUESTED -> APPROVED -> EXECUTED"). Below this
  /// amount a single FINANCE-permission admin may go straight to EXECUTED;
  /// at/above it, a *different* admin than the requester must APPROVE
  /// first (AdminRefundService enforces this, not just the threshold
  /// value). Amount is in the smallest currency unit, matching every other
  /// amount field in the schema (Order.totalAmount, Refund.amount, ...).
  ADMIN_REFUND_APPROVAL_THRESHOLD_IRR: z.coerce.number().int().positive().default(5_000_000),

  /// Handoff 14 — the platform-default commission rate applied when no
  /// seller-specific or channel-specific CommissionRule matches (basis
  /// points: 1000 = 10.00%). CommissionRuleService seeds a matching
  /// platform-default row on boot from this same value — see that
  /// service's own doc comment.
  DEFAULT_PLATFORM_COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(1_000),

  /// Two-person control threshold for settlement payout (spec: "for
  /// settlement above configurable threshold... initiator should not
  /// approve their own payout"), mirroring
  /// ADMIN_REFUND_APPROVAL_THRESHOLD_IRR's own precedent exactly. Amount is
  /// in the smallest currency unit (IRR).
  SETTLEMENT_APPROVAL_THRESHOLD_IRR: z.coerce.number().int().positive().default(10_000_000),

  /// CMS media upload limit (spec: "enforce size/type limits") — 5MB is
  /// generous for a blog cover/body image without a native image-processing
  /// dependency (see README "Media") to pre-compress on the server.
  CMS_MEDIA_MAX_SIZE_BYTES: z.coerce.number().int().positive().default(5_242_880),
});

export type AppEnv = z.infer<typeof envSchema>;

/// Handoff 07 (spec section 53) — "sandbox" is safe with no credentials at
/// all (every adapter is a documented stub); "production" would call a real
/// endpoint, so a provider enabled without its credentials configured fails
/// startup instead of silently running the sandbox stub against real money.
function validatePaymentConfig(env: AppEnv): void {
  if (env.PAYMENT_SANDBOX_MODE !== "production") return;
  const missing: string[] = [];
  if (env.STANDARD_GATEWAY_ENABLED && !(env.STANDARD_GATEWAY_MERCHANT_ID && env.STANDARD_GATEWAY_API_KEY)) missing.push("STANDARD_GATEWAY_MERCHANT_ID/STANDARD_GATEWAY_API_KEY");
  if (env.SNAPPAY_ENABLED && !(env.SNAPPAY_MERCHANT_ID && env.SNAPPAY_API_KEY)) missing.push("SNAPPAY_MERCHANT_ID/SNAPPAY_API_KEY");
  if (env.DIGIPAY_ENABLED && !(env.DIGIPAY_MERCHANT_ID && env.DIGIPAY_API_KEY)) missing.push("DIGIPAY_MERCHANT_ID/DIGIPAY_API_KEY");
  if (missing.length > 0) {
    throw new Error(`PAYMENT_SANDBOX_MODE=production requires credentials for every enabled provider. Missing: ${missing.join(", ")}`);
  }
}

/// Handoff 08 (spec section 41-42) — "production → silent fake shipment
/// success" is explicitly forbidden, so a real provider enabled without its
/// credentials configured fails startup instead of silently running
/// DevShippingAdapter-equivalent behavior against real courier jobs.
function validateShippingConfig(env: AppEnv): void {
  if (env.SHIPPING_MODE !== "production") return;
  const missing: string[] = [];
  if (env.ALOPEYK_ENABLED && !(env.ALOPEYK_API_BASE_URL && env.ALOPEYK_API_KEY)) missing.push("ALOPEYK_API_BASE_URL/ALOPEYK_API_KEY");
  if (env.SNAPPBOX_ENABLED && !(env.SNAPPBOX_API_BASE_URL && env.SNAPPBOX_API_KEY)) missing.push("SNAPPBOX_API_BASE_URL/SNAPPBOX_API_KEY");
  if (missing.length > 0) {
    throw new Error(`SHIPPING_MODE=production requires credentials for every enabled provider. Missing: ${missing.join(", ")}`);
  }
}

/// Handoff 09 (spec section 58) — "no fake production success" applies here
/// exactly as it does to payments/shipping: a real provider enabled without
/// its credentials configured fails startup rather than silently running
/// DevMarketplaceAdapter-equivalent simulation against real listings/orders.
function validateMarketplaceConfig(env: AppEnv): void {
  if (env.MARKETPLACE_SANDBOX_MODE !== "production") return;
  const missing: string[] = [];
  if (env.TOROB_ENABLED && !(env.TOROB_BASE_URL && env.TOROB_API_KEY)) missing.push("TOROB_BASE_URL/TOROB_API_KEY");
  if (env.DIGIKALA_ENABLED && !(env.DIGIKALA_BASE_URL && env.DIGIKALA_API_KEY)) missing.push("DIGIKALA_BASE_URL/DIGIKALA_API_KEY");
  if (missing.length > 0) {
    throw new Error(`MARKETPLACE_SANDBOX_MODE=production requires credentials for every enabled provider. Missing: ${missing.join(", ")}`);
  }
}

/// Handoff 10 (spec: "no fake production success") applies here exactly as
/// it does to payments/shipping/marketplace: Faraz enabled without its
/// credentials configured fails startup rather than silently running
/// DevMessagingAdapter-equivalent simulation against real recipients.
function validateMessagingConfig(env: AppEnv): void {
  if (env.MESSAGING_SANDBOX_MODE !== "production") return;
  const missing: string[] = [];
  if (env.FARAZ_SMS_ENABLED && !(env.FARAZ_SMS_BASE_URL && env.FARAZ_SMS_API_KEY)) missing.push("FARAZ_SMS_BASE_URL/FARAZ_SMS_API_KEY");
  if (missing.length > 0) {
    throw new Error(`MESSAGING_SANDBOX_MODE=production requires credentials for every enabled provider. Missing: ${missing.join(", ")}`);
  }
}

/// Handoff 12 — "Google may be unavailable locally, but the app must
/// continue working" means GOOGLE_AUTH_ENABLED=false is always valid with
/// zero credentials configured; enabling it without every required
/// credential is the one case that fails startup, since a half-configured
/// Google client would otherwise fail unpredictably on the first real login
/// attempt instead of at boot.
function validateGoogleAuthConfig(env: AppEnv): void {
  if (!env.GOOGLE_AUTH_ENABLED) return;
  const missing: string[] = [];
  if (!env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!env.GOOGLE_CALLBACK_URL) missing.push("GOOGLE_CALLBACK_URL");
  if (missing.length > 0) {
    throw new Error(`GOOGLE_AUTH_ENABLED=true requires all Google OAuth credentials. Missing: ${missing.join(", ")}`);
  }
}

export function validateEnv(source: NodeJS.ProcessEnv): AppEnv {
  const env = loadEnv(envSchema, source);
  validatePaymentConfig(env);
  validateShippingConfig(env);
  validateMarketplaceConfig(env);
  validateMessagingConfig(env);
  validateGoogleAuthConfig(env);
  return env;
}
