import type { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";

type Config = Pick<ConfigService<AppEnv, true>, "get">;

const servesHttps = (config: Config) =>
  String(config.get("WEB_APP_ORIGIN", { infer: true }))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .some((origin) => origin.startsWith("https://"));

/**
 * A real deployment that serves people — not only `NODE_ENV=production`. The canonical server runs
 * `NODE_ENV=development` with sandbox providers (env.ts refuses `production` until S3 and a real OTP provider
 * exist), so the deploy contract's DEPLOYMENT_ENVIRONMENT and a public https origin count too.
 */
export function isLiveDeployment(config: Config): boolean {
  return config.get("NODE_ENV", { infer: true }) === "production" || config.get("DEPLOYMENT_ENVIRONMENT", { infer: true }) === "production" || servesHttps(config);
}

/**
 * Cookies carry `Secure` whenever the site is served over https, so a session or CSRF cookie never travels over
 * plain http (a first visit to http://… before HSTS is cached, or any http sub-request an attacker can inject).
 */
export function useSecureCookies(config: Config): boolean {
  return config.get("NODE_ENV", { infer: true }) === "production" || servesHttps(config);
}
