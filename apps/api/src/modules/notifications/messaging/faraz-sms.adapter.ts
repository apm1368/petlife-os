import { Injectable } from "@nestjs/common";
import { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type { MessageStatusResult, MessagingGateway, MessagingWebhookInput, MessagingWebhookResult, SendSmsInput, SendSmsResult } from "./messaging-gateway.interface";
import { MESSAGING_PROVIDER_CAPABILITIES } from "./messaging-provider-registry";
import { simulateSendSms } from "./messaging-simulation.util";
import { FarazSmsClient } from "../../../common/faraz/faraz-sms.client";

/** Faraz Pattern API adapter. A successful response means accepted/queued, never delivered. */
@Injectable()
export class FarazSmsAdapter implements MessagingGateway {
  readonly provider = MessagingProvider.FARAZ;
  readonly capabilities = MESSAGING_PROVIDER_CAPABILITIES[MessagingProvider.FARAZ];

  constructor(private readonly config: ConfigService<AppEnv, true>, private readonly faraz: FarazSmsClient) {}

  private isProductionConfigured(): boolean {
    return this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }) === "production";
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (this.isProductionConfigured()) {
      const result = await this.faraz.sendPattern({
        patternCode: this.config.get("FARAZ_SMS_NOTIFICATION_PATTERN_CODE", { infer: true })!,
        recipient: input.destination,
        attributes: { [this.config.get("FARAZ_SMS_NOTIFICATION_BODY_ATTRIBUTE", { infer: true })]: input.body },
      });
      if (result.ok) return { status: "SENT", providerMessageId: result.providerMessageId };
      return { status: "FAILED", failureKind: result.kind, failureCode: result.code, failureMessage: "Faraz SMS did not accept the message." };
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
