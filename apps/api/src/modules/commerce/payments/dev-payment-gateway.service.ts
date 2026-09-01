import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PaymentChargeInput, PaymentChargeResult, PaymentGateway } from "./payment-gateway.interface";

/**
 * The only PaymentGateway implementation this phase (spec section 37) — no
 * real card gateway. `mode` (default SUCCESS) is caller-supplied so tests
 * and the dev UI can deterministically exercise every path (success,
 * failure, pending) without a real payment method ever existing. This is
 * exactly what proves the adapter architecture: `DevPaymentGateway` is a
 * complete, swappable implementation of `PaymentGateway`, not a special
 * case Checkout's own logic knows about.
 */
@Injectable()
export class DevPaymentGateway implements PaymentGateway {
  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerReference = `dev_${randomUUID()}`;
    const mode = input.mode ?? "SUCCESS";

    if (mode === "FAILURE") {
      return { status: "FAILED", providerReference, failureCode: "DEV_SIMULATED_DECLINE", failureMessage: "The development payment gateway simulated a declined charge." };
    }
    if (mode === "PENDING") {
      return { status: "PENDING", providerReference };
    }
    return { status: "SUCCEEDED", providerReference };
  }
}
