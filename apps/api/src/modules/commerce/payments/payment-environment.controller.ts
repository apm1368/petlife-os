import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";

/**
 * Batch 6 — tells the UI, honestly, whether online payments are real or sandbox, so donation and
 * booking screens never imply that a sandbox payment moved real money. No credentials, no provider
 * internals — just the mode and whether a direct-payment gateway is available.
 */
@Controller("payments")
export class PaymentEnvironmentController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  @Get("environment")
  environment() {
    const mode = this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production" ? "production" : "sandbox";
    const onlinePaymentAvailable = this.gateways.listEnabled().some((g) => g.capabilities.supportsDirectPayment);
    return { mode, onlinePaymentAvailable };
  }
}
