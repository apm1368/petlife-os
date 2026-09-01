import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { ProviderCapabilities } from "@petlife/types";
import { PROVIDER_CAPABILITIES } from "./payment-provider-registry";
import type {
  PaymentChargeInput,
  PaymentChargeResult,
  PaymentGateway,
  PaymentRefundInput,
  PaymentRefundResult,
  PaymentStatusResult,
} from "./payment-gateway.interface";

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
  readonly provider = PaymentProvider.DEV_SIMULATED;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.DEV_SIMULATED;

  private readonly statuses = new Map<string, PaymentChargeResult["status"]>();

  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerReference = `dev_${randomUUID()}`;
    const mode = input.mode ?? "SUCCESS";

    let result: PaymentChargeResult;
    if (mode === "FAILURE") {
      result = { status: "FAILED", providerReference, failureCode: "DEV_SIMULATED_DECLINE", failureMessage: "The development payment gateway simulated a declined charge." };
    } else if (mode === "PENDING") {
      result = { status: "PENDING", providerReference };
    } else {
      result = { status: "SUCCEEDED", providerReference };
    }
    this.statuses.set(providerReference, result.status);
    return result;
  }

  async getStatus(providerReference: string): Promise<PaymentStatusResult> {
    const status = this.statuses.get(providerReference);
    if (!status) return { status: "UNKNOWN", providerReference };
    const mapped = { SUCCEEDED: "CAPTURED", FAILED: "FAILED", PENDING: "PENDING" } as const;
    return { status: mapped[status], providerReference };
  }

  async refund(_input: PaymentRefundInput): Promise<PaymentRefundResult> {
    return { status: "SUCCEEDED", providerRefundReference: `dev_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(_rawBody: unknown, _signatureHeader: string | undefined): boolean {
    return true;
  }
}
