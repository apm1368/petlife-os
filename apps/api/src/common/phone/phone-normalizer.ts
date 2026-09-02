/**
 * The one reusable phone-normalization path (Handoff 10 spec: "do not
 * scatter 09.../+98.../0098... normalization logic across modules").
 * `auth/identifier.util.ts` is deliberately left untouched — it only needs
 * to tell email from phone for OTP delivery, never a canonical E.164 form —
 * so this lives here as a standalone utility for messaging's own needs
 * (SMS destination, masking) rather than folded into auth.
 *
 * Iran-specific today (Handoff 10 is Iran-first), but the shape — a plain
 * function returning a discriminated result — is what CountryConfig-driven
 * per-country rules would plug into later without a call-site change.
 */
export interface NormalizedPhone {
  /** Canonical E.164 form, e.g. "+989121234567". */
  e164: string;
  /** ISO country code the number was normalized for. */
  countryCode: string;
}

const IRAN_MOBILE_PATTERN = /^9\d{9}$/;

/**
 * Normalizes an Iranian mobile number to E.164. Accepts 09121234567,
 * 9121234567, +989121234567, and 00989121234567. Returns null rather than
 * silently coercing an invalid number into a valid-looking one (spec: "do
 * not silently alter invalid numbers into valid-looking numbers").
 */
export function normalizeIranianPhone(input: string): NormalizedPhone | null {
  const trimmed = input.trim().replace(/[\s-]/g, "");
  let national: string | null = null;

  if (trimmed.startsWith("+98")) national = trimmed.slice(3);
  else if (trimmed.startsWith("0098")) national = trimmed.slice(4);
  else if (trimmed.startsWith("98") && trimmed.length === 12) national = trimmed.slice(2);
  else if (trimmed.startsWith("0")) national = trimmed.slice(1);
  else national = trimmed;

  if (!national || !IRAN_MOBILE_PATTERN.test(national)) return null;
  return { e164: `+98${national}`, countryCode: "IR" };
}

/** Masks an E.164 number for logs/admin responses, e.g. "+98********67" — never the full number (spec: "never expose full phone numbers unnecessarily"). */
export function maskPhone(e164: string): string {
  if (e164.length <= 6) return "*".repeat(e164.length);
  const country = e164.slice(0, 3);
  const last2 = e164.slice(-2);
  return `${country}${"*".repeat(e164.length - 5)}${last2}`;
}
