import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";
import type { MessageStatusResult, MessagingGateway, MessagingWebhookInput, MessagingWebhookResult, SendSmsInput, SendSmsResult } from "./messaging-gateway.interface";
import { MESSAGING_PROVIDER_CAPABILITIES } from "./messaging-provider-registry";
import { simulateSendSms } from "./messaging-simulation.util";

/**
 * Fully functional deterministic dev/test adapter — the one provider the
 * whole notifications domain can be exercised against with no external
 * credentials. In-memory state only (mirrors DevShippingAdapter/
 * DevMarketplaceAdapter): fine for a single dev/test process, reset on
 * restart, documented as dev/test-only.
 */
@Injectable()
export class DevMessagingAdapter implements MessagingGateway {
  readonly provider = MessagingProvider.DEV;
  readonly capabilities = MESSAGING_PROVIDER_CAPABILITIES[MessagingProvider.DEV];

  private readonly simulatedStatus = new Map<string, NotificationDeliveryStatus>();

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const result = simulateSendSms(input, "dev");
    if (result.status === "SENT" && result.providerMessageId) {
      // DEV simulates a real provider that also confirms delivery a moment later — deterministic, not a real network round-trip.
      this.simulatedStatus.set(result.providerMessageId, NotificationDeliveryStatus.DELIVERED);
    }
    return result;
  }

  async getMessageStatus(providerMessageId: string): Promise<MessageStatusResult> {
    const canonical = this.simulatedStatus.get(providerMessageId) ?? NotificationDeliveryStatus.SENT;
    return { rawStatus: canonical.toLowerCase(), canonicalStatus: canonical };
  }

  async verifyWebhook(input: MessagingWebhookInput): Promise<MessagingWebhookResult> {
    // DEV never signs anything — no secret exists to check (mirrors DevShippingAdapter.handleWebhook).
    const body = input.rawBody as { providerMessageId?: string; rawStatus?: string } | null;
    if (!body || typeof body !== "object" || !body.providerMessageId) return { valid: false };
    const canonicalStatus = body.rawStatus === "failed" ? NotificationDeliveryStatus.FAILED : NotificationDeliveryStatus.DELIVERED;
    this.simulatedStatus.set(body.providerMessageId, canonicalStatus);
    return { valid: true, providerMessageId: body.providerMessageId, rawStatus: body.rawStatus ?? "delivered", canonicalStatus, occurredAt: new Date() };
  }

  /** Dev/test-only helper for generating a distinct correlation id in tests that don't care about the real send path. */
  generateTestMessageId(): string {
    return `dev-msg-${randomUUID()}`;
  }
}
