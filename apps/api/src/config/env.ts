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
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(source: NodeJS.ProcessEnv): AppEnv {
  return loadEnv(envSchema, source);
}
