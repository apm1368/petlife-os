import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const PETLIFE_USER_AGENT = "PetLifeBot/1.0 (+http://185.231.112.154/; pet-friendly travel discovery; contact via site)";

export type FetchErrorCategory = "HOST_NOT_ALLOWED" | "PRIVATE_ADDRESS" | "BLOCKED_BY_SOURCE" | "RATE_LIMITED" | "TIMEOUT" | "HTTP_ERROR" | "TOO_LARGE" | "TOO_MANY_REDIRECTS" | "NETWORK";
export class SourceFetchError extends Error {
  constructor(public readonly category: FetchErrorCategory, message: string, public readonly status?: number) {
    super(message);
  }
}

/** True for loopback, RFC1918, link-local (incl. cloud metadata 169.254.169.254), CGNAT, unique-local and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:") && isPrivateAddress(v.slice(7));
}

/** An outbound/fetchable URL must be https, on an allowlisted host (exact or subdomain), with no credentials, port or IP literal. */
export function validateSourceUrl(raw: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceFetchError("HOST_NOT_ALLOWED", "not a URL");
  }
  if (url.protocol !== "https:") throw new SourceFetchError("HOST_NOT_ALLOWED", "https only");
  if (url.username || url.password) throw new SourceFetchError("HOST_NOT_ALLOWED", "credentials not allowed");
  if (url.port && url.port !== "443") throw new SourceFetchError("HOST_NOT_ALLOWED", "port not allowed");
  const host = url.hostname.toLowerCase();
  if (isIP(host)) throw new SourceFetchError("HOST_NOT_ALLOWED", "IP literal not allowed");
  if (!allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new SourceFetchError("HOST_NOT_ALLOWED", `host ${host} not allowlisted`);
  return url;
}

/**
 * The only way an adapter talks to the network: allowlisted https hosts, DNS answers checked against private ranges
 * (SSRF), every redirect hop re-validated (max 3), bounded time and size, honest User-Agent, no cookies, no auth.
 * 403/429 and anti-bot pages surface as BLOCKED_BY_SOURCE / RATE_LIMITED — callers stop, they never retry around them.
 */
export async function safeFetch(raw: string, allowedHosts: string[], opts: { timeoutMs: number; maxBytes?: number } = { timeoutMs: 10000 }): Promise<{ status: number; body: string; finalUrl: string; contentType: string | null }> {
  let current = validateSourceUrl(raw, allowedHosts);
  for (let hop = 0; hop <= 3; hop++) {
    const addrs = await lookup(current.hostname, { all: true }).catch(() => { throw new SourceFetchError("NETWORK", "DNS lookup failed"); });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new SourceFetchError("PRIVATE_ADDRESS", "host resolves to a private address");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": PETLIFE_USER_AGENT, accept: "text/html,application/json;q=0.9" } });
    } catch (e) {
      throw new SourceFetchError(ctrl.signal.aborted ? "TIMEOUT" : "NETWORK", e instanceof Error ? e.message : "fetch failed");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SourceFetchError("HTTP_ERROR", "redirect without location", res.status);
      current = validateSourceUrl(new URL(loc, current).toString(), allowedHosts);
      continue;
    }
    const maxBytes = opts.maxBytes ?? 2_000_000;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new SourceFetchError("TOO_LARGE", "response too large");
    const body = (await res.text()).slice(0, maxBytes);
    if (res.status === 429) throw new SourceFetchError("RATE_LIMITED", "source rate limited us", 429);
    if (res.status === 403 || /captcha|Request Rejected|ترافیک غیر معمولی/i.test(body)) throw new SourceFetchError("BLOCKED_BY_SOURCE", "source rejected automated access", res.status);
    if (res.status >= 400) throw new SourceFetchError("HTTP_ERROR", `HTTP ${res.status}`, res.status);
    return { status: res.status, body, finalUrl: current.toString(), contentType: res.headers.get("content-type") };
  }
  throw new SourceFetchError("TOO_MANY_REDIRECTS", "too many redirects");
}
