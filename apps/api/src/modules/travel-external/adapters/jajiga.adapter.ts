import { AdapterError, type HealthCheckResult, type ScrapeContext } from "./travel-source-adapter";
import { PendingParserAdapter } from "./pending-parser.adapter";

/** Jajiga is an accommodation source candidate; we have not observed a listing payload or verified coverage counts. */
export class JajigaPublicWebAdapter extends PendingParserAdapter {
  readonly code = "JAJIGA";
  readonly strategy = "PENDING_DISCOVERY";

  async healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult> {
    const url = "https://www.jajiga.com/robots.txt";
    try {
      const response = await ctx.http.getText(url, { maxBytes: 200_000, accept: "text/plain" });
      const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(response.body);
      return {
        ok: !disallowAll,
        schemaOk: undefined,
        checkedUrl: url,
        detail: disallowAll ? "robots.txt disallows all paths" : `robots.txt reachable (HTTP ${response.status}); listing parser and nationwide coverage assessment pending`,
      };
    } catch (error) {
      return { ok: false, category: error instanceof AdapterError ? error.category : "SOURCE_UNAVAILABLE", checkedUrl: url, detail: error instanceof Error ? error.message : "health check failed" };
    }
  }
}
