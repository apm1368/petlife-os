import { safeFetch, SourceFetchError } from "../safe-fetch";
import { AdapterError, type AdapterListing, type AdapterQuote, type TravelSourceAdapter } from "./travel-source-adapter";

/**
 * Jabama / Alibaba today (see docs/product/travel-external-sources.md): no public API or authorized feed is known,
 * and both sites' WAFs reject this server's identified requests — even robots.txt (HTTP 403). Retrieval is therefore
 * not implemented; `probe` re-checks honestly (one robots.txt request) so the status can change if access is granted.
 * Nothing here retries around a block, rotates identity or parses pages.
 */
export class BlockedSourceAdapter implements TravelSourceAdapter {
  constructor(public readonly code: string, private readonly probeUrl: string) {}

  async probe(allowedHosts: string[], timeoutMs: number) {
    try {
      const r = await safeFetch(this.probeUrl, allowedHosts, { timeoutMs, maxBytes: 200_000 });
      return { ok: true, detail: `robots.txt reachable (HTTP ${r.status}); a compliant retrieval mechanism is still required before enabling automation` };
    } catch (e) {
      if (e instanceof SourceFetchError) return { ok: false, category: e.category === "BLOCKED_BY_SOURCE" ? ("BLOCKED_EXTERNAL" as const) : e.category === "RATE_LIMITED" ? ("RATE_LIMITED" as const) : e.category === "TIMEOUT" ? ("TIMEOUT" as const) : ("SOURCE_UNAVAILABLE" as const), detail: `${e.category}${e.status ? ` (HTTP ${e.status})` : ""}` };
      return { ok: false, category: "SOURCE_UNAVAILABLE" as const, detail: "probe failed" };
    }
  }

  discover(): Promise<AdapterListing[]> {
    return Promise.reject(new AdapterError("NOT_SUPPORTED", `${this.code}: no permitted automated retrieval mechanism`));
  }

  fetchListing(): Promise<AdapterListing> {
    return Promise.reject(new AdapterError("NOT_SUPPORTED", `${this.code}: no permitted automated retrieval mechanism`));
  }

  quote(): Promise<AdapterQuote> {
    return Promise.reject(new AdapterError("NOT_SUPPORTED", `${this.code}: no permitted automated price retrieval`));
  }
}
