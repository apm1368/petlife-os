import { Injectable } from "@nestjs/common";
import { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type {
  MessageStatusResult,
  MessagingGateway,
  MessagingWebhookInput,
  MessagingWebhookResult,
  SendSmsInput,
  SendSmsResult,
} from "./messaging-gateway.interface";
import { MESSAGING_PROVIDER_CAPABILITIES } from "./messaging-provider-registry";
import { simulateSendSms } from "./messaging-simulation.util";
import { KavenegarSmsClient } from "../../../common/kavenegar/kavenegar-sms.client";

/**
 * Kavenegar adapter for notifications: the rendered body goes as plain text (sms/send) from KAVENEGAR_SENDER,
 * or from the account's default line when that is unset.
 * Admin SMS-pattern bindings are Faraz pattern codes and do not apply here. A successful response means
 * accepted/queued, never delivered. Outside MESSAGING_SANDBOX_MODE=production it only simulates.
 */
@Injectable()
export class KavenegarSmsAdapter implements MessagingGateway {
  readonly provider = MessagingProvider.KAVENEGAR;
  readonly capabilities = MESSAGING_PROVIDER_CAPABILITIES[MessagingProvider.KAVENEGAR];

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly kavenegar: KavenegarSmsClient,
  ) {}

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }) !== "production") return simulateSendSms(input, "kavenegar");
    const result = await this.kavenegar.send({ receptor: input.destination, message: input.body });
    if (result.ok) return { status: "SENT", providerMessageId: result.providerMessageId };
    return {
      status: "FAILED",
      failureKind: result.kind,
      failureCode: result.code,
      failureMessage: "Kavenegar did not accept the message.",
    };
  }

  async getMessageStatus(_providerMessageId: string): Promise<MessageStatusResult> {
    // Never called (capabilities.supportsStatusQuery is false) — implemented only for interface completeness.
    return { rawStatus: "unknown", canonicalStatus: NotificationDeliveryStatus.SENT };
  }

  async verifyWebhook(_input: MessagingWebhookInput): Promise<MessagingWebhookResult> {
    // Never called (capabilities.supportsWebhook is false).
    return { valid: false };
  }
}
