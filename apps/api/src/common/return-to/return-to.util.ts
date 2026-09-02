/**
 * A `returnTo` is a caller-supplied destination path (from a query param or
 * an OAuth-handshake cookie) that we redirect a browser to after auth
 * succeeds. Accepting it unvalidated is a classic open-redirect: an attacker
 * sends a victim a link like `/welcome?returnTo=https://evil.example`, the
 * victim logs in for real, and lands on the attacker's site with a
 * just-authenticated referrer. The fix is an allow-list shape, not a
 * deny-list of bad patterns: only a path that starts with a single `/` and
 * is not protocol-relative (`//host/...` or `/\host/...`, both of which a
 * browser resolves as "go to a different host") is accepted.
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
  // A decoded control character (e.g. a smuggled newline) or an embedded
  // scheme (`/\t/javascript:...`) is never a legitimate in-app path.
  // eslint-disable-next-line no-control-regex -- deliberately matching control characters, not a typo
  if (/[\x00-\x1f]/.test(decoded)) return fallback;
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return fallback;

  return decoded;
}
