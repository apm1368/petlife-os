/** A coarse, human label for a user-agent ("Chrome · Android"). Nothing is inferred beyond what the header states. */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : null;
  const os = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
