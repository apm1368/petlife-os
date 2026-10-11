import { AdapterError, type HealthCheckResult, type ScrapeContext } from "./travel-source-adapter";
import { PendingParserAdapter } from "./pending-parser.adapter";

const API = "https://ws.alibaba.ir/api";
/** A landing slug from the public sitemap; its public JSON (no auth) was observed on 2026-10-11. */
const HEALTH_SLUG = "ramsar-villa";

interface LandingResponse { success?: boolean; unauthorizedRequest?: boolean; result?: { availableSearch?: { destination?: string }; minPrice?: number; accommodationFilters?: unknown } }

/**
 * alibaba.ir accommodation (NOT Alibaba Cloud). Strategy: UNOFFICIAL_PUBLIC_WEB_ENDPOINT — the JSON the public website
 * itself calls without login: landing-pages (observed), Available/Search and Available/GetDetails (not yet observed).
 * Search/details mapping is intentionally pending until a real payload is seen; health check uses the observed landing
 * endpoint (one GET) and verifies its schema.
 */
export class AlibabaPublicWebAdapter extends PendingParserAdapter {
  readonly code = "ALIBABA";
  readonly strategy = "UNOFFICIAL_PUBLIC_WEB_ENDPOINT:landing(+search,details pending)";

  /** Observed public landing contract → destination key + FROM price (the only fields relied on). */
  static parseLanding(body: LandingResponse): { destination: string | null; minPriceIrr: number | null } {
    if (!body || body.success !== true || body.unauthorizedRequest === true || !body.result) throw new AdapterError("MALFORMED", "landing response did not match the observed contract");
    const destination = typeof body.result.availableSearch?.destination === "string" && body.result.availableSearch.destination ? body.result.availableSearch.destination : null;
    const minPriceIrr = typeof body.result.minPrice === "number" && body.result.minPrice > 0 ? Math.round(body.result.minPrice) : null;
    return { destination, minPriceIrr };
  }

  async healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult> {
    const url = `${API}/v1/accom/landing/landing-pages/path/${HEALTH_SLUG}`;
    try {
      const parsed = AlibabaPublicWebAdapter.parseLanding(await ctx.http.getJson<LandingResponse>(url));
      return { ok: true, schemaOk: Boolean(parsed.destination), checkedUrl: url, detail: `public landing JSON reachable without auth (destination=${parsed.destination ?? "?"}); search/details parser pending observed payload` };
    } catch (e) {
      if (e instanceof AdapterError) return { ok: false, category: e.category, checkedUrl: url, detail: e.message };
      return { ok: false, category: "SOURCE_UNAVAILABLE", checkedUrl: url, detail: "health check failed" };
    }
  }
}
