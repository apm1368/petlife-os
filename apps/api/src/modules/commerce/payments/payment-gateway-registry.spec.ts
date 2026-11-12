import { PaymentProvider } from "@prisma/client";
import { PaymentProviderUnavailableException } from "../../../common/errors/api-exception";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";

const gateway = (provider: PaymentProvider) => ({ provider, capabilities: { supportsDirectPayment: true } });

function registry(env: Record<string, unknown>) {
  const config = { get: (key: string) => ({ NODE_ENV: "development", DEV_SIMULATION_ENABLED: false, STANDARD_GATEWAY_ENABLED: true, ZIBAL_ENABLED: true, ...env })[key] };
  return new PaymentGatewayRegistry(gateway(PaymentProvider.DEV_SIMULATED) as never, gateway(PaymentProvider.STANDARD_GATEWAY) as never, gateway(PaymentProvider.ZIBAL) as never, config as never);
}

describe("PaymentGatewayRegistry: simulated payments", () => {
  it("offers no gateway and refuses every charge in sandbox mode on a live server (dev simulation off)", () => {
    const r = registry({ PAYMENT_SANDBOX_MODE: "sandbox" });
    expect(r.listEnabled()).toEqual([]);
    for (const provider of [PaymentProvider.DEV_SIMULATED, PaymentProvider.STANDARD_GATEWAY, PaymentProvider.ZIBAL]) {
      expect(() => r.assertChargeable(provider)).toThrow(PaymentProviderUnavailableException);
    }
    // Records (wallet checkout intents, reconciliation, webhook verification) still resolve their adapter.
    expect(r.resolve(PaymentProvider.DEV_SIMULATED).provider).toBe(PaymentProvider.DEV_SIMULATED);
  });

  it("keeps the sandbox usable where dev simulation is explicitly on (local dev and the e2e suite)", () => {
    const r = registry({ PAYMENT_SANDBOX_MODE: "sandbox", DEV_SIMULATION_ENABLED: true });
    expect(r.listEnabled().map((g) => g.provider)).toEqual([PaymentProvider.DEV_SIMULATED, PaymentProvider.STANDARD_GATEWAY, PaymentProvider.ZIBAL]);
    expect(() => r.assertChargeable(PaymentProvider.DEV_SIMULATED)).not.toThrow();
  });

  it("in production mode only real gateways can charge; DEV_SIMULATED never", () => {
    const r = registry({ PAYMENT_SANDBOX_MODE: "production", NODE_ENV: "production" });
    expect(r.listEnabled().map((g) => g.provider)).toEqual([PaymentProvider.STANDARD_GATEWAY, PaymentProvider.ZIBAL]);
    expect(() => r.assertChargeable(PaymentProvider.DEV_SIMULATED)).toThrow(PaymentProviderUnavailableException);
  });
});
