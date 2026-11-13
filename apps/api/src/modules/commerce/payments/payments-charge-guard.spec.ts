import { PaymentIntentStatus, PaymentProvider } from "@prisma/client";
import { PaymentProviderUnavailableException } from "../../../common/errors/api-exception";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";
import { PaymentsService } from "./payments.service";

describe("PaymentsService.charge on a live server with simulated payments off", () => {
  it("refuses before the intent is claimed or any attempt is recorded, whatever outcome the caller asks for", async () => {
    const intent = { id: "pi-1", status: PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, provider: PaymentProvider.DEV_SIMULATED, amount: 1000, currency: "IRR" };
    const prisma = {
      paymentIntent: { findUniqueOrThrow: jest.fn().mockResolvedValue(intent), updateMany: jest.fn() },
      paymentAttempt: { create: jest.fn() },
    };
    const config = { get: (key: string) => ({ PAYMENT_SANDBOX_MODE: "sandbox", NODE_ENV: "development", DEV_SIMULATION_ENABLED: false })[key] };
    const dev = { provider: PaymentProvider.DEV_SIMULATED, capabilities: { supportsDirectPayment: true }, charge: jest.fn() };
    const registry = new PaymentGatewayRegistry(dev as never, { provider: PaymentProvider.STANDARD_GATEWAY } as never, { provider: PaymentProvider.ZIBAL } as never, config as never);
    const service = new PaymentsService(prisma as never, { publish: jest.fn() } as never, registry);

    await expect(service.charge("pi-1", "SUCCESS")).rejects.toBeInstanceOf(PaymentProviderUnavailableException);
    expect(prisma.paymentIntent.updateMany).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
    expect(dev.charge).not.toHaveBeenCalled();
  });
});
