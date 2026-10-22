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

  it("binds to loopback and trusts only the local proxy by default (finding G)", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.TRUST_PROXY).toBe("loopback");
  });
});

describe("validateEnv — FarazSMS OTP and direct OTP sign-in", () => {
  it("requires the key, sender line and OTP pattern before the FarazSMS OTP provider can boot", () => {
    expect(() => validateEnv({ ...base, NODE_ENV: "development", OTP_PROVIDER: "faraz", FARAZ_SMS_API_KEY: "k" } as NodeJS.ProcessEnv)).toThrow(/FARAZ_SMS_SENDER, FARAZ_SMS_OTP_PATTERN_CODE/);
    const env = validateEnv({ ...base, NODE_ENV: "development", OTP_PROVIDER: "faraz", FARAZ_SMS_API_KEY: "k", FARAZ_SMS_SENDER: "9000", FARAZ_SMS_OTP_PATTERN_CODE: "abc" } as NodeJS.ProcessEnv);
    expect(env.FARAZ_SMS_OTP_PATTERN_VAR).toBe("code");
  });

  it("keeps the code-only sign-in fixture off by default and refuses it in production", () => {
    expect(validateEnv({ ...base, NODE_ENV: "development" } as NodeJS.ProcessEnv).AUTH_DIRECT_OTP_LOGIN_ENABLED).toBe(false);
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", STORAGE_DRIVER: "s3", OTP_PROVIDER: "faraz", FARAZ_SMS_API_KEY: "k", FARAZ_SMS_SENDER: "9000", FARAZ_SMS_OTP_PATTERN_CODE: "abc", AUTH_DIRECT_OTP_LOGIN_ENABLED: "true" } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_DIRECT_OTP_LOGIN_ENABLED/);
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
});
