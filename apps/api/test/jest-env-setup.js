// Runs before the test framework loads any test file (and therefore before
// AppModule/ConfigModule read process.env), so the e2e suite always targets
// the dedicated test database instead of whatever `.env` points at locally.
process.env.NODE_ENV = "test";
process.env.GOOGLE_DEV_SIMULATE_ENABLED = process.env.GOOGLE_DEV_SIMULATE_ENABLED ?? "true";
// The suites drive sandbox webhooks and dev/simulate routes; the canonical server leaves this off.
process.env.DEV_SIMULATION_ENABLED = process.env.DEV_SIMULATION_ENABLED ?? "true";
// Suites create households and assert FREE-plan limits; the welcome trial is opted into per test.
process.env.WELCOME_TRIAL_PLAN_CODE = process.env.WELCOME_TRIAL_PLAN_CODE ?? "";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://petlife:petlife@localhost:5432/petlife_os_test?schema=public";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.WEB_APP_ORIGIN = process.env.WEB_APP_ORIGIN ?? "http://localhost:3000";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-only-session-secret-not-for-prod";
process.env.CSRF_SECRET = process.env.CSRF_SECRET ?? "test-only-csrf-secret-not-for-prod";

// Pet-taxi suites exercise the priced path with the QA-only straight-line distance (never the production default).
process.env.TRANSPORT_DISTANCE_MODE = process.env.TRANSPORT_DISTANCE_MODE ?? "straight_line_demo";
