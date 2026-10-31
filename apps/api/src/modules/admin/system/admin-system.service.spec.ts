import { AdminSystemService } from "./admin-system.service";

function setup(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    WEB_APP_ORIGIN: "https://opetlife.ir",
    OTP_PROVIDER: "dev",
    MESSAGING_SANDBOX_MODE: "sandbox",
    MESSAGING_PROVIDER: "dev",
    FARAZ_SMS_ENABLED: false,
    FARAZ_SMS_API_KEY: undefined,
    FARAZ_SMS_SENDER: undefined,
    FARAZ_SMS_NOTIFICATION_PATTERN_CODE: undefined,
    GOOGLE_AUTH_ENABLED: false,
    GOOGLE_DEV_SIMULATE_ENABLED: false,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_CALLBACK_URL: undefined,
    PAYMENT_SANDBOX_MODE: "production",
    STANDARD_GATEWAY_MERCHANT_ID: undefined,
    STANDARD_GATEWAY_API_KEY: undefined,
    SNAPPAY_ENABLED: false,
    DIGIPAY_ENABLED: false,
    SNAPPAY_MERCHANT_ID: undefined,
    SNAPPAY_API_KEY: undefined,
    DIGIPAY_MERCHANT_ID: undefined,
    DIGIPAY_API_KEY: undefined,
    SHIPPING_MODE: "production",
    ALOPEYK_API_KEY: undefined,
    SNAPPBOX_API_KEY: undefined,
    MARKETPLACE_SANDBOX_MODE: "production",
    TOROB_API_KEY: undefined,
    DIGIKALA_API_KEY: undefined,
    TRANSPORT_DISTANCE_MODE: "unavailable",
    STORAGE_DRIVER: "local",
    ...overrides,
  };
  const prisma = {
    notificationDelivery: { findFirst: jest.fn().mockResolvedValue(null) },
    paymentAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const config = { get: jest.fn((key: string) => values[key]) };
  return { service: new AdminSystemService(prisma as never, {} as never, config as never), values, config };
}

function statusByKey(result: Awaited<ReturnType<AdminSystemService["integrations"]>>) {
  return Object.fromEntries(result.items.map((item) => [item.key, item]));
}

describe("AdminSystemService integration truthfulness", () => {
  it("reports production modes with missing credentials as NOT_CONFIGURED, never LIVE", async () => {
    const { service } = setup();
    const statuses = statusByKey(await service.integrations());

    expect(statuses.PAYMENT).toMatchObject({ status: "NOT_CONFIGURED", missingConfiguration: ["STANDARD_GATEWAY_MERCHANT_ID", "STANDARD_GATEWAY_API_KEY"] });
    expect(statuses.SHIPPING).toMatchObject({ status: "NOT_CONFIGURED", missingConfiguration: ["ALOPEYK_API_KEY", "SNAPPBOX_API_KEY"] });
    expect(statuses.MARKETPLACE).toMatchObject({ status: "NOT_CONFIGURED", missingConfiguration: ["TOROB_API_KEY", "DIGIKALA_API_KEY"] });
    expect(statuses.BNPL).toMatchObject({ status: "NOT_CONFIGURED" });
  });

  it("does not claim LIVE merely because production credentials are present without a real adapter", async () => {
    const { service } = setup({
      STANDARD_GATEWAY_MERCHANT_ID: "merchant-id",
      STANDARD_GATEWAY_API_KEY: "payment-secret",
      SNAPPAY_ENABLED: true,
      SNAPPAY_MERCHANT_ID: "snapp-merchant",
      SNAPPAY_API_KEY: "snapp-secret",
      DIGIPAY_MERCHANT_ID: "digipay-merchant",
      DIGIPAY_API_KEY: "digipay-secret",
      ALOPEYK_API_KEY: "alopeyk-secret",
      SNAPPBOX_API_KEY: "snappbox-secret",
      TOROB_API_KEY: "torob-secret",
      DIGIKALA_API_KEY: "digikala-secret",
    });
    const statuses = statusByKey(await service.integrations());

    expect(statuses.PAYMENT).toMatchObject({ status: "NOT_IMPLEMENTED", configurationComplete: true });
    expect(statuses.BNPL).toMatchObject({ status: "NOT_IMPLEMENTED", configurationComplete: true });
    expect(statuses.SHIPPING).toMatchObject({ status: "NOT_IMPLEMENTED", configurationComplete: true });
    expect(statuses.MARKETPLACE).toMatchObject({ status: "NOT_IMPLEMENTED", configurationComplete: true });
    expect(JSON.stringify(statuses)).not.toContain("secret");
  });
});
