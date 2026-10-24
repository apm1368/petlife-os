import { AdapterError, type HealthCheckResult, type ScrapeContext } from "./travel-source-adapter";
import { PendingParserAdapter } from "./pending-parser.adapter";

/**
 * jabama.com. Public discovery strategy not verified yet (order: category/list pages → embedded JSON → public XHR,
 * same rules as Alibaba). Until then only robots.txt is checked; no parsing is guessed.
 */
export class JabamaPublicWebAdapter extends PendingParserAdapter {
  readonly code = "JABAMA";
  readonly strategy = "PENDING_DISCOVERY";

  async healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult> {
    const url = "https://www.jabama.com/robots.txt";
    try {
      const r = await ctx.http.getText(url, { maxBytes: 200_000 });
      const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(r.body);
      return { ok: !disallowAll, schemaOk: undefined, checkedUrl: url, detail: disallowAll ? "robots.txt disallows all paths" : `robots.txt reachable (HTTP ${r.status}); discovery strategy pending` };
    } catch (e) {
      return { ok: false, category: e instanceof AdapterError ? e.category : "SOURCE_UNAVAILABLE", checkedUrl: url, detail: e instanceof Error ? e.message : "health check failed" };
    }
  }
}
