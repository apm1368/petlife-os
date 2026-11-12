import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Tells IndexNow search engines (Bing — which also feeds ChatGPT search and Copilot — Yandex, Seznam,
 * Naver) that a public article URL changed, so a newly published article is crawled within minutes instead
 * of waiting for the next sitemap read. Production only; fire-and-forget, so a slow or failing search
 * engine never delays or fails an editor's publish. The key is public by design: the web app serves it at
 * `/{key}.txt` to prove the site owns the URLs.
 */
@Injectable()
export class IndexNowService {
  private readonly logger = new Logger(IndexNowService.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  notify(paths: string[]): void {
    if (this.config.get("DEPLOYMENT_ENVIRONMENT", { infer: true }) !== "production" || paths.length === 0) return;
    const origin = this.config.get("WEB_APP_ORIGIN", { infer: true }).split(",")[0]!.trim().replace(/\/$/, "");
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return;
    }
    const key = this.config.get("INDEXNOW_KEY", { infer: true });
    const body = { host, key, keyLocation: `${origin}/${key}.txt`, urlList: paths.map((path) => `${origin}${path}`) };
    void fetch(INDEXNOW_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
      .then((response) => {
        if (!response.ok && response.status !== 202) this.logger.warn(`IndexNow answered ${response.status} for ${paths.length} URL(s)`);
      })
      .catch((error: unknown) => this.logger.warn(`IndexNow ping failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}
