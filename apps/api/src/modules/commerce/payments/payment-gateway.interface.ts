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

/**
 * Provider-agnostic payment abstraction (spec sections 33-34, 37) —
 * Checkout's own business logic depends only on this interface, never on a
 * specific gateway's request/response shape. Adding a real gateway later
 * (SnappPay, DigiPay) means a new class implementing this interface plus a
 * new `PaymentProvider` enum value, never a change to CheckoutService.
 */
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

export interface PaymentGateway {
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
}
