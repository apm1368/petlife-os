import type { MessagingProvider, NotificationDeliveryStatus } from "@prisma/client";

/** Sandbox/dev-only outcome selector — mirrors ShippingSimMode/MarketplaceSimMode. Never present in a real provider integration; DevMessagingAdapter honors it for deterministic tests. */
export type MessagingSimMode = "SUCCESS" | "FAILURE_TRANSIENT" | "FAILURE_PERMANENT" | "PENDING";

export interface SendSmsInput {
  /** Always an already-normalized E.164 destination — MessagingGateway implementations never see a raw 09.../+98... string. */
  destination: string;
  body: string;
  /** Used only for DEV's own deterministic-outcome test hook; a real adapter ignores it. */
  mode?: MessagingSimMode;
}

export interface SendSmsResult {
  status: "SENT" | "FAILED";
  providerMessageId?: string;
  failureKind?: "TRANSIENT" | "PERMANENT";
  failureCode?: string;
  failureMessage?: string;
}

export interface MessageStatusResult {
  rawStatus: string;
  canonicalStatus: NotificationDeliveryStatus;
}

export interface MessagingWebhookInput {
  rawBody: unknown;
  signatureHeader: string | undefined;
}

/** `valid: false` means the signature/payload could not be verified — the caller must never mutate any delivery based on it (mirrors ShippingWebhookResult). */
export interface MessagingWebhookResult {
  valid: boolean;
  providerMessageId?: string;
  rawStatus?: string;
  canonicalStatus?: NotificationDeliveryStatus;
  occurredAt?: Date;
}

export interface MessagingProviderCapabilities {
  /** Whether the provider is expected to report DELIVERED at all — if false, a SENT status is the ceiling; DELIVERED is never fabricated (spec: "if Faraz documentation does not expose reliable delivery callback/status, keep status at SENT"). */
  supportsDeliveryStatus: boolean;
  supportsWebhook: boolean;
  supportsStatusQuery: boolean;
  /** Whether Persian (non-ASCII/Unicode) SMS content is supported without additional encoding concerns. */
  supportsUnicode: boolean;
}

/**
 * Provider-neutral SMS transport abstraction. Notification/domain code never
 * calls a provider directly — always through this interface, resolved via
 * MessagingProviderRegistry — mirroring PaymentGateway/ShippingGateway/
 * MarketplaceChannelAdapter exactly. No Faraz-specific concept (endpoint
 * shape, auth header, status vocabulary) is ever referenced outside
 * faraz-sms.adapter.ts.
 */
export interface MessagingGateway {
  readonly provider: MessagingProvider;
  readonly capabilities: MessagingProviderCapabilities;

  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  /** Only called when `capabilities.supportsStatusQuery` is true. */
  getMessageStatus(providerMessageId: string): Promise<MessageStatusResult>;
  /** Verifies, parses, and normalizes a webhook delivery in one call — only relevant when `capabilities.supportsWebhook` is true. */
  verifyWebhook(input: MessagingWebhookInput): Promise<MessagingWebhookResult>;
}
