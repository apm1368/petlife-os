export const OTP_PROVIDER = Symbol("OTP_PROVIDER");

/**
 * Boundary between auth and OTP delivery. Dev logs only outside production;
 * Faraz sends the code through the official Pattern API.
 */
export interface OtpProvider {
  /** Issues (or resends) a code for `identifier`. Throws OtpRateLimitedException on cooldown/rate-limit. */
  sendOtp(identifier: string): Promise<void>;

  /** Verifies `code` for `identifier`. Throws OtpInvalidException on mismatch/expiry/attempt exhaustion. */
  verifyOtp(identifier: string, code: string): Promise<void>;
}
