/**
 * Client-side mirror of the API's sanitizeReturnTo (apps/api/src/common/return-to/return-to.util.ts).
 * The API is the real security boundary for the Google OAuth redirect (a
 * full page navigation it controls); this copy exists so the OTP/password
 * flows — which redirect via next/navigation, entirely client-side — apply
 * the exact same allow-list before ever calling router.replace with a
 * caller-supplied path, and so a bad returnTo degrades to a sane default
 * instead of a broken navigation.
 */
export function sanitizeReturnTo(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/")) return fallback;
  if (decoded.startsWith("//")) return fallback;
  if (decoded.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex -- deliberately matching control characters, not a typo
  if (/[\x00-\x1f]/.test(decoded)) return fallback;
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return fallback;

  return decoded;
}

/** Builds the /welcome URL a gated action redirects to, carrying returnTo through the auth flow. */
export function buildLoginUrl(locale: string, returnTo: string): string {
  return `/${locale}/welcome?returnTo=${encodeURIComponent(returnTo)}`;
}
