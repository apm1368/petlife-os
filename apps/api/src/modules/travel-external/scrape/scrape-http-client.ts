import { safeFetch, SourceFetchError, type SafeFetchOptions } from "../safe-fetch";
import { AdapterError } from "../adapters/travel-source-adapter";

export interface ScrapeHttpConfig {
  allowedHosts: string[];
  timeoutMs: number;
  requestDelayMinMs: number;
  requestDelayMaxMs: number;
  /** Hard request budget for one run. */
  maxRequests: number;
  maxBytes?: number;
}

/**
 * Per-run HTTP client: strictly one request at a time (concurrency 1), a random polite pause between requests, a request
 * budget, and stop-on-block semantics. 403/CAPTCHA → BLOCKED_EXTERNAL, 429 → RATE_LIMITED carrying Retry-After. There is
 * no retry around a block, no identity rotation and no proxying.
 */
export class ScrapeHttpClient {
  requests = 0;
  private last = 0;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly cfg: ScrapeHttpConfig, private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  get remaining() { return Math.max(0, this.cfg.maxRequests - this.requests); }

  getText(url: string, opts: Partial<SafeFetchOptions> = {}) { return this.enqueue(() => this.raw(url, { ...opts, method: "GET" })); }
  getJson<T = unknown>(url: string) { return this.enqueue(async () => this.parse<T>(await this.raw(url, { method: "GET", accept: "application/json" }))); }
  postJson<T = unknown>(url: string, json: unknown) { return this.enqueue(async () => this.parse<T>(await this.raw(url, { method: "POST", json, accept: "application/json" }))); }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private parse<T>(r: { body: string }): T {
    try {
      return JSON.parse(r.body) as T;
    } catch {
      throw new AdapterError("MALFORMED", "response is not JSON");
    }
  }

  private async raw(url: string, opts: Partial<SafeFetchOptions>) {
    if (this.requests >= this.cfg.maxRequests) throw new AdapterError("BUDGET_EXHAUSTED", "request budget for this run is used up");
    const gap = this.cfg.requestDelayMinMs + Math.random() * Math.max(0, this.cfg.requestDelayMaxMs - this.cfg.requestDelayMinMs);
    const wait = this.last ? this.last + gap - Date.now() : 0;
    if (wait > 0) await this.sleep(wait);
    this.requests++;
    try {
      return await safeFetch(url, this.cfg.allowedHosts, { timeoutMs: this.cfg.timeoutMs, maxBytes: this.cfg.maxBytes ?? 3_000_000, ...opts });
    } catch (e) {
      if (e instanceof SourceFetchError) {
        if (e.category === "BLOCKED_BY_SOURCE") throw new AdapterError("BLOCKED_EXTERNAL", `source denied automated access${e.status ? ` (HTTP ${e.status})` : ""}`, e.status);
        if (e.category === "RATE_LIMITED") throw new AdapterError("RATE_LIMITED", "source asked us to slow down (HTTP 429)", 429, e.retryAfterMs);
        if (e.category === "TIMEOUT") throw new AdapterError("TIMEOUT", "request timed out");
        if (e.category === "HTTP_ERROR" && e.status === 404) throw new AdapterError("LISTING_REMOVED", "HTTP 404", 404);
        if (e.category === "HTTP_ERROR" && (e.status ?? 0) >= 500) throw new AdapterError("SOURCE_UNAVAILABLE", `HTTP ${e.status}`, e.status);
        throw new AdapterError(e.category === "HOST_NOT_ALLOWED" || e.category === "PRIVATE_ADDRESS" ? "NOT_SUPPORTED" : "SOURCE_UNAVAILABLE", `${e.category}${e.status ? ` (HTTP ${e.status})` : ""}`, e.status);
      }
      throw e;
    } finally {
      this.last = Date.now();
    }
  }
}
