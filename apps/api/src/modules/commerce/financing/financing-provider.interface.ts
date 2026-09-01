import type { PaymentProvider } from "@prisma/client";
import type { FinancingEligibilityStatus, ProviderCapabilities } from "@petlife/types";

export type FinancingOutcomeStatus = "APPROVED" | "DECLINED" | "PENDING";
export type FinancingAuthorizeMode = "APPROVE" | "DECLINE" | "PENDING";

export interface FinancingPlanOption {
  providerPlanId: string;
  installmentCount: number;
  downPaymentAmount?: number;
  installmentAmount?: number;
  feeAmount?: number;
  totalPayableAmount: number;
  currency: string;
  firstDueAt?: string;
  scheduleJson?: unknown;
}

export interface FinancingEligibilityInput {
  amount: number;
  currency: string;
}

export interface FinancingEligibilityResult {
  status: FinancingEligibilityStatus;
}

export interface FinancingPlansInput {
  amount: number;
  currency: string;
}

export interface FinancingAuthorizeInput {
  financingIntentId: string;
  amount: number;
  currency: string;
  selectedPlan?: FinancingPlanOption;
  /** DEV/sandbox only — a real provider decides this itself after redirect/authorization; see README. */
  mode?: FinancingAuthorizeMode;
}

export interface FinancingAuthorizeResult {
  status: FinancingOutcomeStatus;
  providerReference: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface FinancingStatusResult {
  status: FinancingOutcomeStatus | "CANCELLED" | "UNKNOWN";
  providerReference: string;
}

export interface FinancingRefundInput {
  providerReference: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface FinancingRefundResult {
  status: "SUCCEEDED" | "FAILED";
  providerRefundReference?: string;
  failureMessage?: string;
}

/**
 * BNPL/installment provider abstraction (spec sections 3, 8-9) — a
 * deliberately separate interface from PaymentGateway (spec section 6): a
 * financing provider's lifecycle (eligibility → plans → authorize) has no
 * equivalent in a direct-charge flow, and forcing both shapes into one
 * interface would mean optional methods everywhere. `checkEligibility`/
 * `getPlans` are themselves optional here because not every provider
 * supports them (spec section 12) — callers must check
 * `capabilities.supportsEligibilityCheck` before calling `checkEligibility`,
 * never call it speculatively and treat "not implemented" as "not eligible".
 */
export interface FinancingProvider {
  readonly provider: PaymentProvider;
  readonly capabilities: ProviderCapabilities;

  checkEligibility?(input: FinancingEligibilityInput): Promise<FinancingEligibilityResult>;
  getPlans?(input: FinancingPlansInput): Promise<FinancingPlanOption[]>;
  authorize(input: FinancingAuthorizeInput): Promise<FinancingAuthorizeResult>;
  getStatus(providerReference: string): Promise<FinancingStatusResult>;
  refund(input: FinancingRefundInput): Promise<FinancingRefundResult>;
  verifyWebhookSignature(rawBody: unknown, signatureHeader: string | undefined): boolean;
}

export const FINANCING_PROVIDERS = Symbol("FINANCING_PROVIDERS");
