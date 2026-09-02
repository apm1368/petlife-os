import { Injectable } from "@nestjs/common";
import { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type { MessageStatusResult, MessagingGateway, MessagingWebhookInput, MessagingWebhookResult, SendSmsInput, SendSmsResult } from "./messaging-gateway.interface";
import { MESSAGING_PROVIDER_CAPABILITIES } from "./messaging-provider-registry";
import { simulateSendSms } from "./messaging-simulation.util";

const NOT_CONFIGURED_MESSAGE = "Faraz SMS production integration is not configured (no official merchant documentation/credentials available to this project).";

/**
 * ============================================================================
 * PROVIDER DOCUMENTATION SAFETY — Faraz SMS
 * ============================================================================
 * Official docs source:        UNKNOWN — no official Faraz SMS merchant/API
 *                               documentation or credentials were available
 *                               to this project at implementation time.
 * Auth mechanism:               UNKNOWN.
 * Sandbox availability:         UNKNOWN.
 * Required credentials:         UNKNOWN — `FARAZ_SMS_BASE_URL`/
 *                               `FARAZ_SMS_API_KEY`/`FARAZ_SMS_SENDER` are
 *                               reserved env vars for whenever real
 *                               credentials/docs become available; unused by
 *                               this adapter today.
 * Send request/response shape:  UNKNOWN.
 * Delivery status/webhook:      UNKNOWN — capabilities below mark
 *                               supportsDeliveryStatus/supportsWebhook as
 *                               false (see messaging-provider-registry.ts)
 *                               since this project could not confirm Faraz
 *                               exposes a reliable delivery-confirmation
 *                               callback or status-query endpoint;
 *                               `getMessageStatus`/`verifyWebhook` below
 *                               exist for interface completeness only and
 *                               are never relied on for a DELIVERED status.
 * Idempotency support:          UNKNOWN.
 *
 * Because none of the above is confirmed, this adapter does NOT call any
 * real Faraz endpoint, invent a request/response shape, guess an auth
 * header, or claim a production integration. `sendSms` below delegates to
 * the same generic, clearly-labeled simulation engine DevMessagingAdapter
 * uses (see messaging-simulation.util.ts) — this proves the
 * MessagingGateway/registry boundary genuinely supports a second SMS
 * provider without any Notification/domain-event code change, while never
 * presenting a simulated field/status name as a real Faraz API value.
 * Replacing this file's internals with a real HTTP client is the only
 * change a credentialed integration would need. If
 * `MESSAGING_SANDBOX_MODE=production` is set without real credentials
 * configured, every method below returns an explicit "not configured"
 * failure instead of silently falling back to simulation under a
 * production flag (mirrors Torob/Digikala/AloPeyk/SnappBox's own
 * `isProductionConfigured()` gate).
 * ============================================================================
 */
@Injectable()
export class FarazSmsAdapter implements MessagingGateway {
  readonly provider = MessagingProvider.FARAZ;
  readonly capabilities = MESSAGING_PROVIDER_CAPABILITIES[MessagingProvider.FARAZ];

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private isProductionConfigured(): boolean {
    return this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }) === "production" && !!this.config.get("FARAZ_SMS_BASE_URL", { infer: true }) && !!this.config.get("FARAZ_SMS_API_KEY", { infer: true });
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (this.isProductionConfigured()) {
      return { status: "FAILED", failureKind: "PERMANENT", failureCode: "PROVIDER_NOT_IMPLEMENTED", failureMessage: NOT_CONFIGURED_MESSAGE };
    }
    return simulateSendSms(input, "faraz");
  }

  async getMessageStatus(_providerMessageId: string): Promise<MessageStatusResult> {
    // Never called by NotificationDeliveryService (capabilities.supportsStatusQuery is false) — implemented only for interface completeness.
    return { rawStatus: "unknown", canonicalStatus: NotificationDeliveryStatus.SENT };
  }

  async verifyWebhook(_input: MessagingWebhookInput): Promise<MessagingWebhookResult> {
    // Never called (capabilities.supportsWebhook is false) — no confirmed Faraz webhook signature scheme exists to verify against.
    return { valid: false };
  }
}
