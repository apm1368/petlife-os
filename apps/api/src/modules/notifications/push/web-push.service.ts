import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { isAllowedPushEndpoint, maskPushEndpoint } from "./push-endpoint.util";
import { encryptPushPayload, PushKeyError, vapidAuthorization } from "./web-push-crypto";

/**
 * What the service worker (apps/web/public/sw.js) receives. Deliberately only a title and a link: a lock screen is
 * public, and push services relay the payload, so no notification body, pet name, clinic name or health detail ever
 * leaves the API this way. The member reads the details after tapping, inside the signed-in app.
 */
export interface PushPayload {
  /** Notification id (or "test-…"). Also the notification tag, so a retried send replaces itself instead of stacking. */
  id: string;
  /** A generic, category-level title in the member's language (see pushTitle). */
  title: string;
  /** Absolute same-origin URL opened when the notification is tapped. */
  url: string;
  lang: string;
  dir: "rtl" | "ltr";
  /** Quiet hours: shown without sound or vibration. */
  silent?: boolean;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushUrgency = "very-low" | "low" | "normal" | "high";

export type PushSendOutcome =
  | { status: "SENT" }
  /** The push service no longer knows this subscription, or it was made for another VAPID key: delete it. */
  | { status: "GONE"; code: string }
  | { status: "TRANSIENT"; code: string; message: string }
  | { status: "PERMANENT"; code: string; message: string };

/** Push services accept 4 KB; aes128gcm adds 103 bytes. Titles are short, so this only guards against a bug. */
const MAX_PAYLOAD_BYTES = 2048;

export function encodePushPayload(payload: PushPayload): string {
  const json = JSON.stringify({ id: payload.id, title: payload.title, url: payload.url, lang: payload.lang, dir: payload.dir, silent: payload.silent === true });
  if (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES) throw new PushKeyError("Push payload too large");
  return json;
}

/**
 * Sends one encrypted Web Push message (RFC 8030/8291, VAPID RFC 8292) to one subscription. Knows nothing about
 * notifications or retries: NotificationDeliveryService owns the claim/retry bookkeeping, exactly as it does for SMS
 * and email.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true }) && this.config.get("WEB_PUSH_VAPID_PRIVATE_KEY", { infer: true }));
  }

  /** The application server key browsers subscribe with. Public by design. */
  publicKey(): string | null {
    return this.isConfigured() ? (this.config.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true }) ?? null) : null;
  }

  async send(target: PushTarget, payload: PushPayload, options: { urgency?: PushUrgency; ttlSeconds?: number } = {}): Promise<PushSendOutcome> {
    if (!this.isConfigured()) return { status: "PERMANENT", code: "PUSH_NOT_CONFIGURED", message: "Web Push keys are not configured." };
    if (!isAllowedPushEndpoint(target.endpoint)) return { status: "GONE", code: "ENDPOINT_NOT_ALLOWED" };
    const keys = {
      publicKey: this.config.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true })!,
      privateKey: this.config.get("WEB_PUSH_VAPID_PRIVATE_KEY", { infer: true })!,
    };
    let body: Buffer;
    let authorization: string;
    try {
      body = encryptPushPayload(Buffer.from(encodePushPayload(payload), "utf8"), target.p256dh, target.auth);
      authorization = vapidAuthorization(target.endpoint, this.config.get("WEB_PUSH_SUBJECT", { infer: true }), keys);
    } catch (error) {
      if (error instanceof PushKeyError) return { status: "GONE", code: "INVALID_SUBSCRIPTION_KEYS" };
      throw error;
    }
    const ttl = options.ttlSeconds ?? this.config.get("WEB_PUSH_TTL_SECONDS", { infer: true });
    let response: Response;
    try {
      response = await fetch(target.endpoint, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: String(ttl),
          Urgency: options.urgency ?? "normal",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(this.config.get("WEB_PUSH_TIMEOUT_MS", { infer: true })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Web Push to ${maskPushEndpoint(target.endpoint)} failed: ${message}`);
      return { status: "TRANSIENT", code: "NETWORK_ERROR", message: `Push service ${maskPushEndpoint(target.endpoint)} unreachable.` };
    }
    // The response body is never read into logs: it can echo the endpoint token.
    await response.body?.cancel().catch(() => undefined);
    return classifyPushResponse(response.status, target.endpoint);
  }
}

export function classifyPushResponse(status: number, endpoint: string): PushSendOutcome {
  if (status >= 200 && status < 300) return { status: "SENT" };
  const code = `HTTP_${status}`;
  if (status === 404 || status === 410 || status === 403) return { status: "GONE", code };
  if (status === 429 || status >= 500) return { status: "TRANSIENT", code, message: `Push service ${maskPushEndpoint(endpoint)} answered ${status}.` };
  return { status: "PERMANENT", code, message: `Push service ${maskPushEndpoint(endpoint)} rejected the message (${status}).` };
}
