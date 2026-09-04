import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderCapabilities } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PROVIDER_CAPABILITIES } from "./payment-provider-registry";
import type {
  PaymentChargeInput,
  PaymentChargeResult,
  PaymentGateway,
  PaymentRefundInput,
  PaymentRefundResult,
  PaymentStatusResult,
} from "./payment-gateway.interface";

const NOT_IMPLEMENTED_MESSAGE = "The standard payment gateway has no live merchant integration configured. This charge was not processed.";

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

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private get secret(): string | undefined {
    return this.config.get("STANDARD_GATEWAY_API_KEY", { infer: true });
  }

  /** No merchant credentials exist for a real gateway call — see class doc comment. */
  private isProductionConfigured(): boolean {
    return this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production";
  }

  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerReference = `stdgw_${randomUUID()}`;

    if (this.isProductionConfigured()) {
      // Never accept a caller-supplied outcome once running against real
      // traffic — there is no live gateway behind this adapter yet, so a
      // charge must fail explicitly rather than silently "succeed."
      return { status: "FAILED", providerReference, failureCode: "STANDARD_GATEWAY_NOT_IMPLEMENTED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    }

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
    if (this.isProductionConfigured()) {
      return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    }
    return { status: "SUCCEEDED", providerRefundReference: `stdgw_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(rawBody: unknown, signatureHeader: string | undefined): boolean {
    if (!this.secret) {
      // `validatePaymentConfig` (config/env.ts) already refuses to boot with
      // PAYMENT_SANDBOX_MODE=production and this provider enabled but no
      // secret configured, so this branch is sandbox-only by construction —
      // still fail closed here as defense in depth rather than trusting that
      // invariant alone.
      return !this.isProductionConfigured();
    }
    if (!signatureHeader) return false;
    const expected = createHmac("sha256", this.secret).update(JSON.stringify(rawBody)).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signatureHeader, "hex");
    return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  }
}
