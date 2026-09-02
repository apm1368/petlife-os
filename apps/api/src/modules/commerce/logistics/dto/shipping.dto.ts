import { IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";
import { ShippingProvider } from "@prisma/client";

export class SelectShippingQuoteDto {
  @IsUUID()
  quoteId!: string;
}

export const SHIPPING_PROVIDER_SLUGS: Record<string, ShippingProvider> = {
  dev: ShippingProvider.DEV,
  alopeyk: ShippingProvider.ALOPEYK,
  snappbox: ShippingProvider.SNAPPBOX,
};

/**
 * The shape every adapter's `handleWebhook` currently expects (spec section
 * 18) — this project's own synthetic convention, not a real provider
 * payload, since no official AloPeyk/SnappBox webhook schema exists (see
 * README). `providerEventId` is optional: when a delivery omits it, the
 * controller derives a deterministic fingerprint instead of trusting a
 * random value (spec section 17).
 */
export class ShippingWebhookDto {
  @IsString()
  providerShipmentId!: string;

  @IsOptional()
  @IsString()
  providerEventId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsString()
  rawStatus!: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class SimulateShippingEventDto {
  @IsOptional()
  @IsString()
  toStatus?: string;
}
