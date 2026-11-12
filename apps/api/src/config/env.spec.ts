import { validateEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "x".repeat(32),
  CSRF_SECRET: "y".repeat(32),
  WEB_APP_ORIGIN: "http://localhost:3000",
};

describe("validateEnv — security invariants", () => {
  it("refuses to boot production with the development OTP provider (finding A)", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: "s3", OTP_PROVIDER: "dev" } as NodeJS.ProcessEnv)).toThrow(/OTP_PROVIDER "dev" cannot run with NODE_ENV=production/);
  });

  it("allows the development OTP provider outside production", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("requires all server-side Faraz values when Faraz handles OTP", () => {
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "faraz" } as NodeJS.ProcessEnv)).toThrow(/FARAZ_SMS_API_KEY/);
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "faraz", FARAZ_SMS_API_KEY: "key", FARAZ_SMS_SENDER: "90008361", FARAZ_SMS_OTP_PATTERN_CODE: "otp-uid" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("refuses a fake production messaging mode without the active Faraz pattern", () => {
    expect(() => validateEnv({ ...base, MESSAGING_SANDBOX_MODE: "production" } as NodeJS.ProcessEnv)).toThrow(/MESSAGING_PROVIDER=faraz/);
    expect(() => validateEnv({ ...base, MESSAGING_SANDBOX_MODE: "production", MESSAGING_PROVIDER: "faraz", FARAZ_SMS_API_KEY: "key", FARAZ_SMS_SENDER: "90008361", FARAZ_SMS_NOTIFICATION_PATTERN_CODE: "notice-uid" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("requires Kavenegar to be enabled with an API key and a Verify template or a sender line when it handles OTP", () => {
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "kavenegar" } as NodeJS.ProcessEnv)).toThrow(/OTP_PROVIDER=kavenegar requires/);
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: "true", KAVENEGAR_API_KEY: "key" } as NodeJS.ProcessEnv)).toThrow(/KAVENEGAR_OTP_TEMPLATE .* or KAVENEGAR_SENDER/);
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "kavenegar", KAVENEGAR_API_KEY: "key", KAVENEGAR_SENDER: "2000660110" } as NodeJS.ProcessEnv)).toThrow(/KAVENEGAR_ENABLED/);
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: "true", KAVENEGAR_API_KEY: "key", KAVENEGAR_SENDER: "2000660110" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => validateEnv({ ...base, OTP_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: "true", KAVENEGAR_API_KEY: "key", KAVENEGAR_OTP_TEMPLATE: "opetlifeotp" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("requires a Kavenegar sender line for production notifications (the account has no default line)", () => {
    expect(() => validateEnv({ ...base, MESSAGING_SANDBOX_MODE: "production", MESSAGING_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: "true", KAVENEGAR_API_KEY: "key" } as NodeJS.ProcessEnv)).toThrow(/KAVENEGAR_API_KEY\/KAVENEGAR_SENDER/);
    expect(() => validateEnv({ ...base, MESSAGING_SANDBOX_MODE: "production", MESSAGING_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: "true", KAVENEGAR_API_KEY: "key", KAVENEGAR_SENDER: "2000660110" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("binds to loopback and trusts only the local proxy by default (finding G)", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.TRUST_PROXY).toBe("loopback");
  });
});

describe("validateEnv — development Google sign-in simulation", () => {
  it("is off unless explicitly enabled, even outside production", () => {
    expect(validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv).GOOGLE_DEV_SIMULATE_ENABLED).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: "development", GOOGLE_DEV_SIMULATE_ENABLED: "true" } as NodeJS.ProcessEnv).GOOGLE_DEV_SIMULATE_ENABLED).toBe(true);
  });
});

describe("validateEnv — dev simulation and boolean flags", () => {
  it("keeps dev simulation off unless explicitly enabled", () => {
    expect(validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv).DEV_SIMULATION_ENABLED).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: "development", DEV_SIMULATION_ENABLED: "true" } as NodeJS.ProcessEnv).DEV_SIMULATION_ENABLED).toBe(true);
  });

  it("reads the string \"false\" as false for provider flags", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development", DEV_MESSAGING_ENABLED: "false", DEV_SHIPPING_ENABLED: "0" } as NodeJS.ProcessEnv);
    expect(env.DEV_MESSAGING_ENABLED).toBe(false);
    expect(env.DEV_SHIPPING_ENABLED).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv).DEV_MESSAGING_ENABLED).toBe(true);
  });

  it("refuses production shipping without courier webhook secrets or with the simulated courier", () => {
    const shipping = { ...base, SHIPPING_MODE: "production", ALOPEYK_API_BASE_URL: "https://a.example", ALOPEYK_API_KEY: "k", SNAPPBOX_ENABLED: "false", DEV_SHIPPING_ENABLED: "false" };
    expect(() => validateEnv(shipping as NodeJS.ProcessEnv)).toThrow(/ALOPEYK_WEBHOOK_SECRET/);
    expect(() => validateEnv({ ...shipping, ALOPEYK_WEBHOOK_SECRET: "w".repeat(32), DEV_SHIPPING_ENABLED: "true" } as NodeJS.ProcessEnv)).toThrow(/DEV_SHIPPING_ENABLED/);
    expect(() => validateEnv({ ...shipping, ALOPEYK_WEBHOOK_SECRET: "w".repeat(32) } as NodeJS.ProcessEnv)).not.toThrow();
  });
});
