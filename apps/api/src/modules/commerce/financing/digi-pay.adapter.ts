import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { ProviderCapabilities } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PROVIDER_CAPABILITIES } from "../payments/payment-provider-registry";
import type {
  FinancingAuthorizeInput,
  FinancingAuthorizeResult,
  FinancingPlanOption,
  FinancingPlansInput,
  FinancingProvider,
  FinancingRefundInput,
  FinancingRefundResult,
  FinancingStatusResult,
} from "./financing-provider.interface";
import { buildIllustrativePlans } from "./snapp-pay.adapter";

/**
 * DigiPay adapter (spec section 9).
 *
 * PROVIDER DOCUMENTATION SAFETY (spec section 10) — read before trusting any
 * field shape below as real:
 *   - Official docs source: UNKNOWN — not available to this project.
 *   - Auth mechanism: UNKNOWN.
 *   - Sandbox availability: UNKNOWN.
 *   - Required credentials: UNKNOWN (DIGIPAY_MERCHANT_ID/DIGIPAY_API_KEY are
 *     reserved env vars for when real credentials exist; unused by this
 *     stub).
 *   - Webhook/signature verification: UNKNOWN real scheme; this stub always
 *     accepts (no assumed scheme at all, unlike the SnappPay stub's
 *     illustrative HMAC check — deliberately not inventing one here either).
 *   - Idempotency support: UNKNOWN.
 *   - Refund capability: UNKNOWN — assumed present (capabilities.supportsRefund).
 *   - Partial refund capability: UNKNOWN — NOT claimed.
 *   - Reconciliation/status query capability: UNKNOWN — assumed present.
 *
 * No `checkEligibility` method exists on this adapter at all — DigiPay's
 * capability entry sets `supportsEligibilityCheck: false` (spec section 12:
 * "if provider does not support pre-check, do not fake it. Use provider
 * authorization flow directly"), so FinancingService never calls a
 * pre-check for this provider; the flow goes straight from plan selection
 * to `authorize()`.
 */
@Injectable()
export class DigiPayAdapter implements FinancingProvider {
  readonly provider = PaymentProvider.DIGI_PAY;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.DIGI_PAY;

  private readonly statuses = new Map<string, "APPROVED" | "DECLINED" | "PENDING">();

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /** No real DigiPay credentials/API integration exist — see class doc comment. */
  private isProductionConfigured(): boolean {
    return this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production";
  }

  async getPlans(input: FinancingPlansInput): Promise<FinancingPlanOption[]> {
    return buildIllustrativePlans(input.amount, input.currency, [4, 8]);
  }

  async authorize(input: FinancingAuthorizeInput): Promise<FinancingAuthorizeResult> {
    const providerReference = `digipay_${randomUUID()}`;

    if (this.isProductionConfigured()) {
      const result: FinancingAuthorizeResult = { status: "DECLINED", providerReference, failureCode: "DIGIPAY_NOT_IMPLEMENTED", failureMessage: "DigiPay has no live merchant integration configured. This installment request was not processed." };
      this.statuses.set(providerReference, "DECLINED");
      return result;
    }

    const mode = input.mode ?? "APPROVE";
    let status: "APPROVED" | "DECLINED" | "PENDING";
    let result: FinancingAuthorizeResult;
    if (mode === "DECLINE") {
      status = "DECLINED";
      result = { status, providerReference, failureCode: "DIGIPAY_SANDBOX_DECLINE", failureMessage: "DigiPay sandbox simulated a declined installment request." };
    } else if (mode === "PENDING") {
      status = "PENDING";
      result = { status, providerReference };
    } else {
      status = "APPROVED";
      result = { status, providerReference };
    }
    this.statuses.set(providerReference, status);
    return result;
  }

  async getStatus(providerReference: string): Promise<FinancingStatusResult> {
    const status = this.statuses.get(providerReference);
    return { status: status ?? "UNKNOWN", providerReference };
  }

  async refund(_input: FinancingRefundInput): Promise<FinancingRefundResult> {
    if (this.isProductionConfigured()) {
      return { status: "FAILED", failureMessage: "DigiPay has no live merchant integration configured." };
    }
    return { status: "SUCCEEDED", providerRefundReference: `digipay_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(_rawBody: unknown, _signatureHeader: string | undefined): boolean {
    // See class doc: no real signature scheme exists yet. Sandbox always
    // accepts so local/test flows can self-trigger webhooks; production must
    // never accept an unverifiable payload.
    return !this.isProductionConfigured();
  }
}
