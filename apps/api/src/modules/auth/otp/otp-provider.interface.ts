export const OTP_PROVIDER = Symbol("OTP_PROVIDER");

/**
 * What a code is for. Codes are stored per purpose, so a code sent to finish sign-up can never be
 * replayed to finish a sign-in or a password reset for the same number, and vice versa.
 */
export type OtpPurpose = "direct" | "register" | "login" | "reset" | "contact" | "privacy";

/**
 * Boundary between the auth flow and whatever actually delivers/validates a one-time code
 * (DevOtpProvider logs it, FarazOtpProvider sends it by SMS). Call sites never change with the provider.
 */
export interface OtpProvider {
  /** Issues (or resends) a code for `identifier`. Throws OtpRateLimitedException on cooldown/rate-limit. */
  sendOtp(identifier: string, purpose?: OtpPurpose): Promise<void>;

  /** Verifies `code` for `identifier`. Throws OtpInvalidException on mismatch/expiry/attempt exhaustion. */
  verifyOtp(identifier: string, code: string, purpose?: OtpPurpose): Promise<void>;
}
