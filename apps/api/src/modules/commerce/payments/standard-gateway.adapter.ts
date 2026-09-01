import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { randomUUID, createHmac } from "node:crypto";
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
 * Provider-neutral "real gateway" slot (spec section 7). Required
 * capabilities per the spec are all implemented at the interface level
 * (create payment, query status, refund, webhook signature verification);
 * what is NOT real is what backs them — this project has no merchant
 * account or credentials for any actual gateway, so `charge()` resolves
 * synchronously from a caller-supplied `mode`, exactly like DevPaymentGateway,
 * rather than performing a live redirect/authorization round-trip. This is
 * the documented gap (see README "Standard payment behavior" and
 * "Known limitations") — the adapter shape a real integration would drop
 * into is real; the network call behind it is not.
 *
 * `verifyWebhookSignature` DOES implement a real HMAC-SHA256 check against
 * `STANDARD_GATEWAY_API_KEY` when one is configured, so the signature-
 * verification *mechanism* is genuinely exercised even though no live
 * provider ever signs a real payload with it in this project.
 */
@Injectable()
export class StandardGatewayAdapter implements PaymentGateway {
  readonly provider = PaymentProvider.STANDARD_GATEWAY;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.STANDARD_GATEWAY;

  private readonly statuses = new Map<string, PaymentChargeResult["status"]>();
  private readonly secret = process.env.STANDARD_GATEWAY_API_KEY;

  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerReference = `stdgw_${randomUUID()}`;
    const mode = input.mode ?? "SUCCESS";

    let result: PaymentChargeResult;
    if (mode === "FAILURE") {
      result = { status: "FAILED", providerReference, failureCode: "STANDARD_GATEWAY_DECLINE", failureMessage: "The standard gateway sandbox simulated a declined charge." };
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
    return { status: "SUCCEEDED", providerRefundReference: `stdgw_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(rawBody: unknown, signatureHeader: string | undefined): boolean {
    if (!this.secret) return true; // sandbox: no secret configured, nothing to verify against
    if (!signatureHeader) return false;
    const expected = createHmac("sha256", this.secret).update(JSON.stringify(rawBody)).digest("hex");
    return expected === signatureHeader;
  }
}
