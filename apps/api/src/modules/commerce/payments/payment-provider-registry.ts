import { PaymentProvider } from "@prisma/client";
import type { ProviderCapabilities } from "@petlife/types";

/**
 * The canonical provider capability registry (spec section 3) — every
 * capability check in product code (CheckoutService, FinancingService, the
 * frontend's payment-method screen) reads from this map, never from a
 * `provider === "SNAPP_PAY"` branch scattered through business logic. Adding
 * a fifth provider later means one new entry here plus a new adapter class.
 */
export const PROVIDER_CAPABILITIES: Record<PaymentProvider, ProviderCapabilities> = {
  DEV_SIMULATED: {
    supportsDirectPayment: true,
    supportsInstallments: false,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsAsyncWebhook: true,
    supportsEligibilityCheck: false,
  },
  /// Provider-neutral "real gateway" slot (spec section 7) — sandbox-only,
  /// no live merchant credentials exist for this project (see README).
  STANDARD_GATEWAY: {
    supportsDirectPayment: true,
    supportsInstallments: false,
    supportsRefund: true,
    supportsPartialRefund: false,
    supportsAsyncWebhook: true,
    supportsEligibilityCheck: false,
  },
  /// SnappPay's real product exposes a pre-authorization eligibility check
  /// (spec section 8) — modeled here since the *shape* of that capability is
  /// well known conceptually, even though this project has no official docs
  /// to confirm the exact request/response fields (see README "Official
  /// documentation / sandbox status").
  SNAPP_PAY: {
    supportsDirectPayment: false,
    supportsInstallments: true,
    supportsRefund: true,
    supportsPartialRefund: false,
    supportsAsyncWebhook: true,
    supportsEligibilityCheck: true,
  },
  /// DigiPay's adapter goes straight to plan selection/authorization (spec
  /// section 12: "if provider does not support pre-check, do not fake it") —
  /// no eligibility pre-check is implemented or claimed.
  DIGI_PAY: {
    supportsDirectPayment: false,
    supportsInstallments: true,
    supportsRefund: true,
    supportsPartialRefund: false,
    supportsAsyncWebhook: true,
    supportsEligibilityCheck: false,
  },
};
