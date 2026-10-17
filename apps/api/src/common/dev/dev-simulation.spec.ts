import { PaymentWebhooksController } from "../../modules/commerce/checkout/payment-webhooks.controller";
import { ShippingWebhooksController } from "../../modules/commerce/logistics/shipping-webhooks.controller";
import { NotificationDevController } from "../../modules/notifications/notification-dev.controller";
import { MessagingProviderDisabledException, ShippingWebhookInvalidException, WebhookSignatureInvalidException } from "../errors/api-exception";
import { devSimulationAllowed } from "./dev-simulation";

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;
const sandboxServer = { NODE_ENV: "development", DEV_SIMULATION_ENABLED: false, PAYMENT_SANDBOX_MODE: "sandbox", SHIPPING_MODE: "sandbox", DEV_MESSAGING_ENABLED: true, DEV_SHIPPING_ENABLED: true };

describe("dev simulation gate", () => {
  it("is open only with the explicit flag, and never in production", () => {
    expect(devSimulationAllowed(config({ NODE_ENV: "development", DEV_SIMULATION_ENABLED: false }))).toBe(false);
    expect(devSimulationAllowed(config({ NODE_ENV: "test", DEV_SIMULATION_ENABLED: true }))).toBe(true);
    expect(devSimulationAllowed(config({ NODE_ENV: "production", DEV_SIMULATION_ENABLED: true }))).toBe(false);
  });

  it("a sandbox server without the flag refuses unsigned payment webhooks before touching any intent", async () => {
    const payments = { resolvePendingIntent: jest.fn() };
    const controller = new PaymentWebhooksController(payments as never, undefined as never, undefined as never, undefined as never, undefined as never, config(sandboxServer));
    await expect(controller.handleWebhook("dev_simulated", { paymentIntentId: "00000000-0000-4000-8000-000000000000", eventId: "e1", status: "SUCCEEDED" } as never)).rejects.toBeInstanceOf(WebhookSignatureInvalidException);
    expect(payments.resolvePendingIntent).not.toHaveBeenCalled();
  });

  it("a sandbox server without the flag refuses shipping webhooks and the dev shipment simulator", async () => {
    const orchestrator = { findShipmentByProviderReference: jest.fn() };
    const controller = new ShippingWebhooksController(undefined as never, orchestrator as never, undefined as never, undefined as never, config(sandboxServer));
    await expect(controller.handleWebhook("dev", { providerShipmentId: "s1" } as never)).rejects.toBeInstanceOf(ShippingWebhookInvalidException);
    await expect(controller.simulateDevEvent(undefined as never, "s1", {})).rejects.toBeTruthy();
    expect(orchestrator.findShipmentByProviderReference).not.toHaveBeenCalled();
  });

  it("a sandbox server without the flag refuses /dev/notifications", async () => {
    const orchestrator = { notify: jest.fn() };
    const controller = new NotificationDevController(config(sandboxServer), orchestrator as never, undefined as never, undefined as never);
    await expect(controller.simulate({ userId: "u", type: "t", category: "SYSTEM" } as never)).rejects.toBeInstanceOf(MessagingProviderDisabledException);
    expect(orchestrator.notify).not.toHaveBeenCalled();
  });
});
