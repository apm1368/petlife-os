/**
 * The one reusable phone-normalization path (Handoff 10 spec: "do not scatter 09.../+98.../0098...
 * normalization logic across modules"). Every phone the API stores, looks up or rate-limits on goes through
 * here — auth identifiers, contact changes, household invitations, SMS destinations — so the same number
 * typed as 0912…, ۰۹۱۲…, +98912… or 0098912… is always one account. The rules mirror @petlife/validation's
 * normalizeIranPhone (what the web client sends); that package ships TypeScript source only, so the API can't
 * load it at runtime — phone-normalizer.spec.ts asserts the two agree on every input form.
 */
export interface NormalizedPhone {
  /** Canonical E.164 form, e.g. "+989121234567". */
  e164: string;
  /** ISO country code the number was normalized for. */
  countryCode: string;
}

/**
 * Normalizes an Iranian mobile number to E.164. Returns null rather than silently coercing an invalid number
 * into a valid-looking one (spec: "do not silently alter invalid numbers into valid-looking numbers").
 */
export function normalizeIranianPhone(input: string): NormalizedPhone | null {
  const phone = toAsciiDigits(input).trim().replace(/[\s()-]/g, "");
  let national: string | null = null;
  if (/^09\d{9}$/.test(phone)) national = phone.slice(1);
  else if (/^9\d{9}$/.test(phone)) national = phone;
  else if (/^\+989\d{9}$/.test(phone)) national = phone.slice(3);
  else if (/^00989\d{9}$/.test(phone)) national = phone.slice(4);
  return national ? { e164: `+98${national}`, countryCode: "IR" } : null;
}

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII; other characters unchanged. */
function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** Masks an E.164 number for logs/admin responses, e.g. "+98********67" — never the full number (spec: "never expose full phone numbers unnecessarily"). */
export function maskPhone(e164: string): string {
  if (e164.length <= 6) return "*".repeat(e164.length);
  const country = e164.slice(0, 3);
  const last2 = e164.slice(-2);
  return `${country}${"*".repeat(e164.length - 5)}${last2}`;
}
