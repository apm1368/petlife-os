import type { PaymentProvider } from "@prisma/client";
import type { ProviderCapabilities } from "@petlife/types";

export type PaymentChargeMode = "SUCCESS" | "FAILURE" | "PENDING";

export interface PaymentChargeInput {
  amount: number;
  currency: string;
  mode?: PaymentChargeMode;
}

export interface PaymentChargeResult {
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  providerReference: string;
  failureCode?: string;
  failureMessage?: string;
}

export type PaymentProviderStatus = "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "CANCELLED" | "UNKNOWN";

export interface PaymentStatusResult {
  status: PaymentProviderStatus;
  providerReference: string;
}

export interface PaymentRefundInput {
  providerReference: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface PaymentRefundResult {
  status: "SUCCEEDED" | "FAILED";
  providerRefundReference?: string;
  failureMessage?: string;
}

/**
 * Provider-agnostic payment abstraction (spec sections 33-34, 37, and
 * Handoff 07 sections 3, 7, 27-28). `charge()` is unchanged from Handoff 06
 * on purpose — it is still the one method DEV_SIMULATED and every other
 * direct-payment adapter uses for the synchronous "simulate an outcome"
 * flow every existing Checkout test depends on. The methods below are
 * additive: `getStatus`/`refund`/`verifyWebhookSignature` are what a real
 * gateway integration needs and what StandardGatewayAdapter exists to prove,
 * even though — with no merchant credentials available to this project — its
 * internals stay a documented, deterministic sandbox stub (see README
 * "Sandbox / production").
 */
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  readonly capabilities: ProviderCapabilities;

  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;

  /** Reconciliation slot (spec section 28) — queries the provider's own record of a prior charge, independent of local state. */
  getStatus(providerReference: string): Promise<PaymentStatusResult>;

  /** Only called when `capabilities.supportsRefund` is true. */
  refund(input: PaymentRefundInput): Promise<PaymentRefundResult>;

  /** Provider-specific signature verification (spec section 16) — DEV_SIMULATED always returns true (no real secret exists to check); a real adapter would verify an HMAC/signature header against its own webhook secret. */
  verifyWebhookSignature(rawBody: unknown, signatureHeader: string | undefined): boolean;
}
