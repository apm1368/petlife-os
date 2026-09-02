import { randomUUID } from "node:crypto";
import type { SendSmsInput, SendSmsResult } from "./messaging-gateway.interface";

/**
 * Deterministic, no-external-network simulation engine shared by
 * DevMessagingAdapter and (when not production-configured) FarazSmsAdapter
 * — mirrors shipping-simulation.util.ts/marketplace-simulation.util.ts
 * exactly. No randomness in outcome — only opaque provider message ids use
 * randomUUID. Defaults to SUCCESS when no `mode` is given, matching
 * DevPaymentGateway/DevShippingAdapter/DevMarketplaceAdapter's own default.
 */
export function simulateSendSms(input: SendSmsInput, providerPrefix: string): SendSmsResult {
  switch (input.mode) {
    case "FAILURE_TRANSIENT":
      return { status: "FAILED", failureKind: "TRANSIENT", failureCode: "SIMULATED_TIMEOUT", failureMessage: "Simulated: the provider timed out." };
    case "FAILURE_PERMANENT":
      return { status: "FAILED", failureKind: "PERMANENT", failureCode: "SIMULATED_INVALID_DESTINATION", failureMessage: "Simulated: the destination number was rejected." };
    case "PENDING":
      // No real "pending" outcome exists for a fire-and-forget SMS send this phase — treated as an immediate transient failure so the retry path is exercised rather than silently dropped.
      return { status: "FAILED", failureKind: "TRANSIENT", failureCode: "SIMULATED_PENDING", failureMessage: "Simulated: the provider has not yet accepted the message." };
    default:
      return { status: "SENT", providerMessageId: `${providerPrefix}-msg-${randomUUID()}` };
  }
}
