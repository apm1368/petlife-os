import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { ProviderCapabilities } from "@petlife/types";
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

  async getPlans(input: FinancingPlansInput): Promise<FinancingPlanOption[]> {
    return buildIllustrativePlans(input.amount, input.currency, [4, 8]);
  }

  async authorize(input: FinancingAuthorizeInput): Promise<FinancingAuthorizeResult> {
    const providerReference = `digipay_${randomUUID()}`;
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
    return { status: "SUCCEEDED", providerRefundReference: `digipay_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(_rawBody: unknown, _signatureHeader: string | undefined): boolean {
    return true;
  }
}
