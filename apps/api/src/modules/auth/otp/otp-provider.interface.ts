import type { OtpPurpose } from "./otp-code-store";

export const OTP_PROVIDER = Symbol("OTP_PROVIDER");

/**
 * Delivery boundary for one-time codes. Providers only deliver the code they are handed; generation, storage,
 * cooldowns, attempt caps and budgets live in OtpService/OtpCodeStore. Dev logs the code outside production;
 * Faraz sends it through its Pattern API, Kavenegar through Verify Lookup.
 */
export interface OtpProvider {
  /** Delivers `code` to `identifier`. Throws when nothing was delivered (no code is stored then). */
  deliver(identifier: string, code: string, purpose: OtpPurpose): Promise<void>;
}
