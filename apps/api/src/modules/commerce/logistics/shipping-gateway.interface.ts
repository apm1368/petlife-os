import type { ShippingProvider, ShipmentStatus } from "@prisma/client";
import type { AddressSnapshotDto } from "@petlife/types";

/** Sandbox/dev-only outcome selector — mirrors PaymentChargeMode (Handoff 07). Never present in a real provider integration; DevShippingAdapter/AloPeykAdapter/SnappBoxAdapter all honor it for deterministic tests. */
export type ShippingSimMode = "SUCCESS" | "FAILURE" | "PENDING";

/**
 * The normalized package/parcel context a quote or shipment-create request
 * carries (spec section 9). `ProductVariant` only reliably has weight (see
 * README) — dimensions are always `undefined` rather than fabricated, and
 * every adapter (including DevShippingAdapter) must treat every field as
 * optional.
 */
export interface ShippingPackage {
  weightGrams?: number;
  widthCm?: number;
  heightCm?: number;
  lengthCm?: number;
  declaredValueIrr?: number;
}

export interface ShippingQuoteRequestInput {
  pickupAddress: AddressSnapshotDto;
  deliveryAddress: AddressSnapshotDto;
  shippingPackage: ShippingPackage;
  mode?: ShippingSimMode;
}

export interface ShippingQuoteOption {
  serviceLevel: string;
  priceIrr: number;
  estimatedPickupMinutes: number;
  estimatedDeliveryMinutes: number;
  providerQuoteId: string;
  expiresInMinutes: number;
}

export interface ShippingQuoteRequestResult {
  status: "AVAILABLE" | "UNAVAILABLE";
  quotes: ShippingQuoteOption[];
  unavailableReason?: string;
}

export interface CreateShipmentInput {
  pickupAddress: AddressSnapshotDto;
  deliveryAddress: AddressSnapshotDto;
  shippingPackage: ShippingPackage;
  providerQuoteId?: string;
  mode?: ShippingSimMode;
}

export interface CreateShipmentResult {
  status: "CREATED" | "FAILED";
  providerShipmentId?: string;
  trackingCode?: string;
  estimatedPickupAt?: Date;
  estimatedDeliveryAt?: Date;
  failureMessage?: string;
}

export interface CancelShipmentResult {
  status: "CANCELED" | "FAILED";
  failureMessage?: string;
}

export interface ShipmentStatusResult {
  rawStatus: string;
  canonicalStatus: ShipmentStatus;
}

export interface ShippingWebhookInput {
  rawBody: unknown;
  signatureHeader: string | undefined;
}

/** `valid: false` means the signature/payload could not be verified — the caller must never mutate any Shipment based on it (spec section 18: "invalid signature/event must not mutate shipment"). */
export interface ShippingWebhookResult {
  valid: boolean;
  providerShipmentId?: string;
  providerEventId?: string;
  eventType?: string;
  rawStatus?: string;
  canonicalStatus?: ShipmentStatus;
  occurredAt?: Date;
}

export interface ShippingProviderCapabilities {
  supportsQuote: boolean;
  supportsCancel: boolean;
  supportsWebhook: boolean;
  supportsStatusQuery: boolean;
  supportsTracking: boolean;
}

/**
 * Provider-neutral logistics abstraction (spec section 10) — Commerce/
 * Logistics code (ShippingOrchestrator, controllers) only ever calls
 * through this interface, resolved via ShippingProviderRegistry; no
 * AloPeyk/SnappBox-shaped payload or field name is ever referenced outside
 * that provider's own adapter module (spec: "never leak provider-specific
 * payload shapes into Order/Checkout/Fulfillment/general Commerce
 * services").
 */
export interface ShippingGateway {
  readonly provider: ShippingProvider;
  readonly capabilities: ShippingProviderCapabilities;

  getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  /** Only called when `capabilities.supportsCancel` is true. */
  cancelShipment(providerShipmentId: string): Promise<CancelShipmentResult>;
  /** Reconciliation slot (spec section 19) — only called when `capabilities.supportsStatusQuery` is true. */
  getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatusResult>;
  /** Verifies, parses, and normalizes a webhook delivery in one call (spec section 10's suggested shape) — provider-specific signature/payload handling never leaves the adapter. */
  handleWebhook(input: ShippingWebhookInput): Promise<ShippingWebhookResult>;
}
