import { createHmac, timingSafeEqual } from "node:crypto";

/** Shortest webhook secret accepted in production (matches the startup check in config/env.ts). */
export const SHIPPING_WEBHOOK_SECRET_MIN_LENGTH = 32;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * A courier callback is genuine only when it proves knowledge of that courier's webhook secret, either as
 *  - an HMAC-SHA256 of the exact request bytes (`X-Webhook-Signature: sha256=<hex>`, `<hex>` or `<base64>`), or
 *  - the secret itself as a callback token (`X-Webhook-Token` header or `?token=`), for couriers that only let
 *    you register a callback URL.
 * No secret configured means nothing verifies.
 */
export function verifyShippingWebhook(input: {
  secret: string | undefined;
  rawBody: Buffer | undefined;
  signatureHeader?: string;
  token?: string;
}): boolean {
  const secret = input.secret?.trim();
  if (!secret || secret.length < SHIPPING_WEBHOOK_SECRET_MIN_LENGTH) return false;
  if (input.token && safeEqual(input.token.trim(), secret)) return true;
  const header = input.signatureHeader?.trim();
  if (!header || !input.rawBody) return false;
  const given = header.replace(/^sha256=/i, "");
  const mac = createHmac("sha256", secret).update(input.rawBody);
  const digest = mac.digest();
  return safeEqual(given.toLowerCase(), digest.toString("hex")) || safeEqual(given, digest.toString("base64"));
}
