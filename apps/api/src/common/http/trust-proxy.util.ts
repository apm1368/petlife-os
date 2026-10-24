import type { NestExpressApplication } from "@nestjs/platform-express";

/** TRUST_PROXY env value → Express "trust proxy" setting ("false"/"0" off, digits = hop count, else a preset such as "loopback"). */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === "false" || value === "0") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/**
 * Behind nginx every request reaches the API from 127.0.0.1. Without trusting that proxy, req.ip is
 * the proxy for everyone: all clients share one throttle bucket and no per-IP limit applies to any
 * client in particular. "loopback" honours X-Forwarded-For only from the local proxy, so a client that
 * talks to the API directly cannot spoof its address.
 */
export function applyTrustProxy(app: NestExpressApplication, value: string): void {
  app.set("trust proxy", parseTrustProxy(value));
}
