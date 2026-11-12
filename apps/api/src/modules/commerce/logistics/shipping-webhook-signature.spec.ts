import { createHmac } from "node:crypto";
import { ShippingProvider } from "@prisma/client";
import { verifyShippingWebhook } from "./shipping-webhook-signature";
import { ShippingWebhooksController } from "./shipping-webhooks.controller";

const SECRET = "s".repeat(40);
const body = Buffer.from(JSON.stringify({ providerShipmentId: "ship-1", rawStatus: "DELIVERED" }));
const hex = createHmac("sha256", SECRET).update(body).digest("hex");

describe("verifyShippingWebhook", () => {
  it("accepts an HMAC of the exact bytes (hex, sha256= prefix, base64) or the callback token", () => {
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body, signatureHeader: hex })).toBe(true);
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body, signatureHeader: `sha256=${hex.toUpperCase()}` })).toBe(true);
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body, signatureHeader: createHmac("sha256", SECRET).update(body).digest("base64") })).toBe(true);
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body, token: SECRET })).toBe(true);
  });

  it("rejects a changed body, a wrong token, a missing signature and a missing or weak secret", () => {
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: Buffer.from(`${body.toString()} `), signatureHeader: hex })).toBe(false);
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body, token: `${SECRET}x` })).toBe(false);
    expect(verifyShippingWebhook({ secret: SECRET, rawBody: body })).toBe(false);
    expect(verifyShippingWebhook({ secret: undefined, rawBody: body, signatureHeader: hex })).toBe(false);
    expect(verifyShippingWebhook({ secret: "short", rawBody: body, token: "short" })).toBe(false);
  });
});

describe("ShippingWebhooksController in production mode", () => {
  function controller(env: Record<string, unknown>) {
    const gateway = { handleWebhook: jest.fn().mockResolvedValue({ valid: true, providerShipmentId: "ship-1", rawStatus: "DELIVERED", canonicalStatus: "DELIVERED" }) };
    const orchestrator = { findShipmentByProviderReference: jest.fn().mockResolvedValue({ id: "s1" }), applyShipmentStatus: jest.fn().mockResolvedValue({ applied: true }) };
    const events = { recordIfNew: jest.fn().mockResolvedValue({ isDuplicate: false }) };
    const config = { get: (key: string) => env[key] };
    const c = new ShippingWebhooksController({ resolve: () => gateway } as never, orchestrator as never, events as never, {} as never, config as never);
    return { c, orchestrator };
  }
  const dto = JSON.parse(body.toString());

  it("moves a shipment only for a correctly signed courier callback", async () => {
    const { c, orchestrator } = controller({ SHIPPING_MODE: "production", ALOPEYK_WEBHOOK_SECRET: SECRET });
    await expect(c.handleWebhook("alopeyk", dto, { rawBody: body } as never)).rejects.toBeDefined();
    await expect(c.handleWebhook("alopeyk", dto, { rawBody: body } as never, "sha256=deadbeef")).rejects.toBeDefined();
    expect(orchestrator.applyShipmentStatus).not.toHaveBeenCalled();
    await expect(c.handleWebhook("alopeyk", dto, { rawBody: body } as never, hex)).resolves.toMatchObject({ processed: true });
    expect(orchestrator.applyShipmentStatus).toHaveBeenCalledWith("s1", "DELIVERED");
  });

  it("never accepts the simulated courier or a courier without a secret", async () => {
    const { c, orchestrator } = controller({ SHIPPING_MODE: "production", SNAPPBOX_WEBHOOK_SECRET: undefined });
    await expect(c.handleWebhook("dev", dto, { rawBody: body } as never, hex, SECRET)).rejects.toBeDefined();
    await expect(c.handleWebhook("snappbox", dto, { rawBody: body } as never, hex)).rejects.toBeDefined();
    expect(orchestrator.applyShipmentStatus).not.toHaveBeenCalled();
    void ShippingProvider;
  });
});
