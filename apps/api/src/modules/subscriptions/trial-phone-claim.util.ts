import { createHmac } from "node:crypto";
import { normalizeIranianPhone } from "../../common/phone/phone-normalizer";

/**
 * The key a verified phone's one lifetime trial is recorded under (SubscriptionTrialPhoneClaim). A keyed hash of the
 * canonical E.164 number, never the number itself: without the server secret the table can't be turned back into
 * phone numbers by trying every mobile number. Rotating SESSION_SECRET only forgets these phone claims; the per-account
 * and per-household trial flags stay in force.
 */
export function trialPhoneHash(phone: string, secret: string): string {
  const canonical = normalizeIranianPhone(phone)?.e164 ?? phone.trim();
  return createHmac("sha256", secret).update(`trial-phone-v1:${canonical}`).digest("hex");
}

/** A phone counts only once it was proven (OTP); a typed, unverified number claims nothing. */
export function verifiedPhoneOf(user: { phone: string | null; phoneVerifiedAt: Date | null } | null): string | null {
  return user?.phone && user.phoneVerifiedAt ? user.phone : null;
}
