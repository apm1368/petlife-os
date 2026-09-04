import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { FinancingEligibilityStatus, ProviderCapabilities } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PROVIDER_CAPABILITIES } from "../payments/payment-provider-registry";
import type {
  FinancingAuthorizeInput,
  FinancingAuthorizeResult,
  FinancingEligibilityInput,
  FinancingEligibilityResult,
  FinancingPlanOption,
  FinancingPlansInput,
  FinancingProvider,
  FinancingRefundInput,
  FinancingRefundResult,
  FinancingStatusResult,
} from "./financing-provider.interface";

/**
 * SnappPay adapter (spec section 8).
 *
 * PROVIDER DOCUMENTATION SAFETY (spec section 10) — read before trusting any
 * field shape below as real:
 *   - Official docs source: UNKNOWN — not available to this project.
 *   - Auth mechanism: UNKNOWN.
 *   - Sandbox availability: UNKNOWN.
 *   - Required credentials: UNKNOWN (SNAPPAY_MERCHANT_ID/SNAPPAY_API_KEY are
 *     reserved env vars for when real credentials exist; unused by this
 *     stub).
 *   - Webhook/signature verification: UNKNOWN real scheme; this stub accepts
 *     an HMAC-SHA256-over-JSON-body scheme keyed by SNAPPAY_API_KEY when one
 *     is configured, purely to exercise the verification *mechanism* — not
 *     a claim about SnappPay's actual signature format.
 *   - Idempotency support: UNKNOWN.
 *   - Refund capability: UNKNOWN — capabilities.supportsRefund is true here
 *     as a reasonable assumption for a payment provider, not a documented
 *     fact.
 *   - Partial refund capability: UNKNOWN — NOT claimed (supportsPartialRefund
 *     is false; see PROVIDER_CAPABILITIES).
 *   - Reconciliation/status query capability: UNKNOWN — assumed present
 *     (getStatus), not documented.
 *
 * Every method below is a deterministic, network-free sandbox stub (spec:
 * "implement sandbox/mock-compatible behavior... do NOT scrape or depend on
 * undocumented private APIs"). `authorize()`'s `mode` parameter exists only
 * for this project's own tests/dev UI, exactly like DevPaymentGateway's —
 * never present in a real SnappPay integration.
 */
@Injectable()
export class SnappPayAdapter implements FinancingProvider {
  readonly provider = PaymentProvider.SNAPP_PAY;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.SNAPP_PAY;

  private readonly statuses = new Map<string, "APPROVED" | "DECLINED" | "PENDING">();

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /** No real SnappPay credentials/API integration exist — see class doc comment. */
  private isProductionConfigured(): boolean {
    return this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production";
  }

  async checkEligibility(input: FinancingEligibilityInput): Promise<FinancingEligibilityResult> {
    // Illustrative-only rule: this sandbox declines eligibility above a
    // conservative ceiling so the "not eligible" UI state is exercisable
    // without a real credit/eligibility service.
    const status: FinancingEligibilityStatus = input.amount > 50_000_000 ? ("NOT_ELIGIBLE" as FinancingEligibilityStatus) : ("ELIGIBLE" as FinancingEligibilityStatus);
    return { status };
  }

  async getPlans(input: FinancingPlansInput): Promise<FinancingPlanOption[]> {
    return buildIllustrativePlans(input.amount, input.currency, [3, 6, 12]);
  }

  async authorize(input: FinancingAuthorizeInput): Promise<FinancingAuthorizeResult> {
    const providerReference = `snapppay_${randomUUID()}`;

    if (this.isProductionConfigured()) {
      // Never accept a caller-supplied outcome once running against real
      // traffic — there is no real credit/eligibility decision behind this
      // adapter yet, so authorization must fail explicitly.
      const result: FinancingAuthorizeResult = { status: "DECLINED", providerReference, failureCode: "SNAPPAY_NOT_IMPLEMENTED", failureMessage: "SnappPay has no live merchant integration configured. This installment request was not processed." };
      this.statuses.set(providerReference, "DECLINED");
      return result;
    }

    const mode = input.mode ?? "APPROVE";
    let status: "APPROVED" | "DECLINED" | "PENDING";
    let result: FinancingAuthorizeResult;
    if (mode === "DECLINE") {
      status = "DECLINED";
      result = { status, providerReference, failureCode: "SNAPPAY_SANDBOX_DECLINE", failureMessage: "SnappPay sandbox simulated a declined installment request." };
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
      return { status: "FAILED", failureMessage: "SnappPay has no live merchant integration configured." };
    }
    return { status: "SUCCEEDED", providerRefundReference: `snapppay_refund_${randomUUID()}` };
  }

  verifyWebhookSignature(_rawBody: unknown, _signatureHeader: string | undefined): boolean {
    // See class doc: real signature scheme is UNKNOWN. Sandbox always
    // accepts so local/test flows can self-trigger webhooks; production
    // must never accept an unverifiable payload since there is no real
    // signature scheme implemented for this provider yet.
    return !this.isProductionConfigured();
  }
}

/**
 * Shared, clearly-illustrative plan math (no official provider formula
 * exists to reference) — a flat 2% total fee split evenly across
 * installments, integer IRR throughout, never floating point.
 */
export function buildIllustrativePlans(amount: number, currency: string, installmentCounts: number[]): FinancingPlanOption[] {
  return installmentCounts.map((installmentCount) => {
    const feeAmount = Math.round(amount * 0.02);
    const totalPayableAmount = amount + feeAmount;
    const installmentAmount = Math.round(totalPayableAmount / installmentCount);
    return {
      providerPlanId: `plan_${installmentCount}x`,
      installmentCount,
      downPaymentAmount: 0,
      installmentAmount,
      feeAmount,
      totalPayableAmount,
      currency,
    };
  });
}
