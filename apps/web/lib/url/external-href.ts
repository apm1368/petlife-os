/**
 * An href for a URL that came from data (a member, partner or import), or null when it is not plain http(s).
 * React does not block `javascript:` / `data:` URLs, and the site has no script CSP, so every data-driven link
 * goes through this before it reaches `href`.
 */
export function externalHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
