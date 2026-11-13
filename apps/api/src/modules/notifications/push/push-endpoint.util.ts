/**
 * A Web Push subscription endpoint is a URL the API later POSTs to on the member's behalf, so a client could
 * otherwise point it at localhost or an internal service (SSRF). Only the browser vendors' own push services are
 * accepted:
 * - fcm.googleapis.com: Chrome, Edge on Android, Samsung Internet, Opera, Brave, and the Android app (a Trusted
 *   Web Activity runs in Chrome, so it shares Chrome's push).
 * - *.push.services.mozilla.com: Firefox.
 * - *.notify.windows.com: Edge on Windows (WNS).
 * - *.push.apple.com: Safari on macOS, and iOS/iPadOS 16.4+ once the site is added to the Home Screen.
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
];

export const PUSH_ENDPOINT_MAX_LENGTH = 1024;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port !== "" && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(host));
}

/** Push endpoints are capability URLs: logs and admin screens show only the push service, never the token. */
export function maskPushEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return "push";
  }
}

/**
 * A short, non-identifying description of the device, so a member can tell their subscriptions apart in
 * settings ("Chrome · Android"). The raw user agent is never stored.
 */
export function deviceLabelFromUserAgent(userAgent: string | undefined | null): string | null {
  const ua = String(userAgent ?? "");
  if (!ua) return null;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /CrOS/i.test(ua)
            ? "ChromeOS"
            : /Linux/i.test(ua)
              ? "Linux"
              : null;
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  const label = [browser, os].filter(Boolean).join(" · ");
  return label || null;
}
