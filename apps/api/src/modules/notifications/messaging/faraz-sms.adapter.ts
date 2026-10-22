import { Injectable } from "@nestjs/common";
import { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type { MessageStatusResult, MessagingGateway, MessagingWebhookInput, MessagingWebhookResult, SendSmsInput, SendSmsResult } from "./messaging-gateway.interface";
import { MESSAGING_PROVIDER_CAPABILITIES } from "./messaging-provider-registry";
import { simulateSendSms } from "./messaging-simulation.util";
import { FarazSmsClient, FarazSmsError } from "./faraz-sms.client";

/**
 * FarazSMS notification transport (docs: https://docs.farazsms.com).
 *
 * With MESSAGING_SANDBOX_MODE=production and credentials configured, notification bodies go out
 * through FarazSMS's simple-send endpoint. FarazSMS moderates and queues free-text sends, so a
 * successful call means "accepted", never "delivered" — capabilities keep DELIVERED unreachable.
 * OTP codes never use this path: they go through a pre-approved pattern (see FarazOtpProvider).
 *
 * In sandbox mode the adapter delegates to the shared, clearly-labelled simulation engine, so no
 * real SMS leaves the server from development or test.
 */
@Injectable()
export class FarazSmsAdapter implements MessagingGateway {
  readonly provider = MessagingProvider.FARAZ;
  readonly capabilities = MESSAGING_PROVIDER_CAPABILITIES[MessagingProvider.FARAZ];

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly client: FarazSmsClient,
  ) {}

  private isProductionMode(): boolean {
    return this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }) === "production";
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (!this.isProductionMode()) return simulateSendSms(input, "faraz");
    if (!this.client.isConfigured()) {
      return { status: "FAILED", failureKind: "PERMANENT", failureCode: "PROVIDER_NOT_CONFIGURED", failureMessage: "FarazSMS API key or sender line is not configured." };
    }
    try {
      const providerMessageId = await this.client.sendSimple({ text: input.body, recipients: [input.destination] });
      return { status: "SENT", providerMessageId: providerMessageId || undefined };
    } catch (error) {
      if (error instanceof FarazSmsError) {
        return { status: "FAILED", failureKind: error.transient ? "TRANSIENT" : "PERMANENT", failureCode: error.httpStatus ? `FARAZ_HTTP_${error.httpStatus}` : "FARAZ_UNREACHABLE", failureMessage: error.message.slice(0, 500) };
      }
      throw error;
    }
  }

  async getMessageStatus(_providerMessageId: string): Promise<MessageStatusResult> {
    // Never called by NotificationDeliveryService (capabilities.supportsStatusQuery is false) — implemented only for interface completeness.
    return { rawStatus: "unknown", canonicalStatus: NotificationDeliveryStatus.SENT };
  }

  async verifyWebhook(_input: MessagingWebhookInput): Promise<MessagingWebhookResult> {
    // Never called (capabilities.supportsWebhook is false) — FarazSMS documents no signed delivery webhook.
    return { valid: false };
  }
}
