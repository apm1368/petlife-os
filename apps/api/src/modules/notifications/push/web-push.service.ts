import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sendNotification, WebPushError, type Urgency } from "web-push";
import type { AppEnv } from "../../../config/env";
import { isAllowedPushEndpoint, maskPushEndpoint } from "./push-endpoint.util";

/** What the service worker (apps/web/public/sw.js) receives and turns into a system notification. */
export interface PushPayload {
  /** Notification id (or "test-…"). Also the notification tag, so a retried send replaces itself instead of stacking. */
  id: string;
  title: string;
  body: string;
  /** Absolute same-origin URL opened when the notification is tapped. */
  url: string;
  lang: string;
  dir: "rtl" | "ltr";
  /** Quiet hours: shown without sound or vibration. */
  silent?: boolean;
  category?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSendOutcome =
  | { status: "SENT" }
  /** The push service no longer knows this subscription, or it was made for another VAPID key: delete it. */
  | { status: "GONE"; code: string }
  | { status: "TRANSIENT"; code: string; message: string }
  | { status: "PERMANENT"; code: string; message: string };

/** Push services accept 4 KB; aes128gcm adds ~100 bytes, so the JSON stays well below that. */
const MAX_PAYLOAD_BYTES = 3000;

export function encodePushPayload(payload: PushPayload): string {
  let body = payload.body;
  let json = JSON.stringify({ ...payload, body });
  while (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES && body.length > 0) {
    body = body.slice(0, Math.max(0, Math.floor(body.length * 0.8) - 1));
    json = JSON.stringify({ ...payload, body: body ? `${body}…` : "" });
  }
  return json;
}

/**
 * Sends one encrypted Web Push message (RFC 8030/8291, VAPID RFC 8292) to one subscription. Knows nothing about
 * notifications or retries: NotificationDeliveryService owns the claim/retry bookkeeping, exactly as it does for SMS
 * and email. VAPID details are passed per call, never set globally.
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

  async send(target: PushTarget, payload: PushPayload, options: { urgency?: Urgency; ttlSeconds?: number } = {}): Promise<PushSendOutcome> {
    if (!this.isConfigured()) return { status: "PERMANENT", code: "PUSH_NOT_CONFIGURED", message: "Web Push keys are not configured." };
    if (!isAllowedPushEndpoint(target.endpoint)) return { status: "GONE", code: "ENDPOINT_NOT_ALLOWED" };
    try {
      await sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, encodePushPayload(payload), {
        vapidDetails: {
          subject: this.config.get("WEB_PUSH_SUBJECT", { infer: true }),
          publicKey: this.config.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true })!,
          privateKey: this.config.get("WEB_PUSH_VAPID_PRIVATE_KEY", { infer: true })!,
        },
        TTL: options.ttlSeconds ?? this.config.get("WEB_PUSH_TTL_SECONDS", { infer: true }),
        urgency: options.urgency ?? "normal",
        timeout: this.config.get("WEB_PUSH_TIMEOUT_MS", { infer: true }),
      });
      return { status: "SENT" };
    } catch (error) {
      return this.classify(error, target.endpoint);
    }
  }

  private classify(error: unknown, endpoint: string): PushSendOutcome {
    if (error instanceof WebPushError) {
      const status = error.statusCode;
      const code = `HTTP_${status}`;
      if (status === 404 || status === 410 || status === 403) return { status: "GONE", code };
      if (status === 429 || status >= 500) return { status: "TRANSIENT", code, message: `Push service ${maskPushEndpoint(endpoint)} answered ${status}.` };
      return { status: "PERMANENT", code, message: `Push service ${maskPushEndpoint(endpoint)} rejected the message (${status}).` };
    }
    const message = error instanceof Error ? error.message : String(error);
    // web-push throws plain Errors for malformed subscription keys before any request is made.
    if (/p256dh|auth|subscription/i.test(message)) return { status: "GONE", code: "INVALID_SUBSCRIPTION_KEYS" };
    this.logger.warn(`Web Push to ${maskPushEndpoint(endpoint)} failed: ${message}`);
    return { status: "TRANSIENT", code: "NETWORK_ERROR", message };
  }
}
