import type { MarketplaceProvider } from "@prisma/client";

/** Sandbox/dev-only outcome selector — mirrors ShippingSimMode (Handoff 08) / PaymentChargeMode (Handoff 07). Never present in a real provider integration. */
export type MarketplaceSimMode = "SUCCESS" | "FAILURE" | "PENDING";

export interface MarketplaceProviderCapabilities {
  supportsListingPublish: boolean;
  supportsInventoryPush: boolean;
  supportsPricePush: boolean;
  supportsOrderPull: boolean;
  supportsWebhooks: boolean;
  supportsOrderCancellation: boolean;
  supportsListingPause: boolean;
  supportsReconciliation: boolean;
  supportsVariantMapping: boolean;
}

export interface PublishListingInput {
  externalProductId?: string;
  externalVariantId?: string;
  sellerSku: string | null;
  title: string;
  priceIrr: number;
  availableQuantity: number;
  mode?: MarketplaceSimMode;
}

export interface PublishListingResult {
  status: "PUBLISHED" | "REJECTED";
  externalListingId?: string;
  failureMessage?: string;
}

export interface UpdateListingInput {
  externalListingId: string;
  title?: string;
  mode?: MarketplaceSimMode;
}

export interface UpdatePriceInput {
  externalListingId: string;
  priceIrr: number;
  mode?: MarketplaceSimMode;
}

export interface UpdateInventoryInput {
  externalListingId: string;
  /** The channel-safe sellable quantity — derived server-side from `onHand - reserved`, never a raw onHand value (spec section 9). */
  availableQuantity: number;
  mode?: MarketplaceSimMode;
}

export interface MarketplaceOperationResult {
  status: "APPLIED" | "FAILED";
  failureMessage?: string;
}

export interface FetchListingStatusResult {
  externalListingId: string;
  rawStatus: string;
  observedPriceIrr?: number;
  observedInventory?: number;
}

export interface FetchedMarketplaceOrderItem {
  externalListingId: string | null;
  sellerSku: string | null;
  quantity: number;
  unitPriceAmount: number;
  totalPriceAmount: number;
}

/** Only what the provider legitimately supplies (spec section 24) — never enriched or guessed. */
export interface FetchedMarketplaceOrder {
  externalOrderId: string;
  rawStatus: string;
  currency: string;
  totalAmount: number;
  placedAt: Date;
  providerUpdatedAt?: Date;
  buyerSnapshot?: Record<string, unknown>;
  shippingSnapshot?: Record<string, unknown>;
  items: FetchedMarketplaceOrderItem[];
}

export interface MarketplaceWebhookInput {
  rawBody: unknown;
  signatureHeader: string | undefined;
}

/** `valid: false` means the payload could not be verified — the caller must never mutate any state based on it (mirrors ShippingWebhookResult, Handoff 08). */
export interface MarketplaceWebhookResult {
  valid: boolean;
  kind?: "ORDER" | "ORDER_CANCELLATION" | "LISTING_STATUS";
  order?: FetchedMarketplaceOrder;
  externalOrderId?: string;
  externalListingId?: string;
}

export interface ReconcileListingInput {
  externalListingId: string;
}

export interface ReconcileListingResult {
  observedPriceIrr?: number;
  observedInventory?: number;
  observedStatus?: string;
}

/**
 * Provider-neutral marketplace channel abstraction (spec section 11) —
 * Seller OS / MarketplaceSyncOrchestrator code only ever calls through this
 * interface, resolved via MarketplaceChannelRegistry; no Torob/Digikala-
 * shaped payload or field name is ever referenced outside that provider's
 * own adapter module (same boundary discipline as ShippingGateway,
 * Handoff 08). Only methods that make sense for a provider's real
 * capabilities are ever called — see `capabilities` and
 * MarketplaceChannelRegistry.assertCapability.
 */
export interface SalesChannelAdapter {
  readonly provider: MarketplaceProvider;
  readonly capabilities: MarketplaceProviderCapabilities;

  publishListing(input: PublishListingInput): Promise<PublishListingResult>;
  updateListing(input: UpdateListingInput): Promise<MarketplaceOperationResult>;
  deactivateListing(externalListingId: string): Promise<MarketplaceOperationResult>;
  updatePrice(input: UpdatePriceInput): Promise<MarketplaceOperationResult>;
  updateInventory(input: UpdateInventoryInput): Promise<MarketplaceOperationResult>;
  fetchListingStatus(externalListingId: string): Promise<FetchListingStatusResult>;
  fetchOrders(since: Date): Promise<FetchedMarketplaceOrder[]>;
  acknowledgeOrder(externalOrderId: string): Promise<MarketplaceOperationResult>;
  cancelOrder(externalOrderId: string): Promise<MarketplaceOperationResult>;
  reconcile(input: ReconcileListingInput): Promise<ReconcileListingResult>;
  /** Only meaningful when `capabilities.supportsWebhooks` is true. */
  verifyWebhook(input: MarketplaceWebhookInput): Promise<MarketplaceWebhookResult>;
}
