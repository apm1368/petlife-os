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

export function validateEnv(source: NodeJS.ProcessEnv): AppEnv {
  const env = loadEnv(envSchema, source);
  validatePaymentConfig(env);
  validateShippingConfig(env);
  return env;
}
