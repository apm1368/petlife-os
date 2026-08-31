export const OTP_PROVIDER = Symbol("OTP_PROVIDER");

/**
 * Boundary between the auth flow and whatever actually delivers/validates a
 * one-time code. A production provider (Twilio Verify, an email OTP vendor)
 * can own the full challenge lifecycle behind this same interface — the
 * call sites in AuthService never change.
 *
 * TODO(production): swap DevOtpProvider for a real SMS/email-backed
 * implementation before launch. Never ship the dev provider to production.
 */
export interface OtpProvider {
  /** Issues (or resends) a code for `identifier`. Throws OtpRateLimitedException on cooldown/rate-limit. */
  sendOtp(identifier: string): Promise<void>;

  /** Verifies `code` for `identifier`. Throws OtpInvalidException on mismatch/expiry/attempt exhaustion. */
  verifyOtp(identifier: string, code: string): Promise<void>;
}
