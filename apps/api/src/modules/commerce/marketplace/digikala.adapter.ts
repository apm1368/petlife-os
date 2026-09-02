import { Injectable } from "@nestjs/common";
import { MarketplaceProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type {
  FetchListingStatusResult,
  FetchedMarketplaceOrder,
  MarketplaceOperationResult,
  MarketplaceWebhookInput,
  MarketplaceWebhookResult,
  PublishListingInput,
  PublishListingResult,
  ReconcileListingInput,
  ReconcileListingResult,
  SalesChannelAdapter,
  UpdateInventoryInput,
  UpdateListingInput,
  UpdatePriceInput,
} from "./marketplace-channel-adapter.interface";
import { MARKETPLACE_PROVIDER_CAPABILITIES } from "./marketplace-provider-registry";
import { simulateApply, simulatePublishListing } from "./marketplace-simulation.util";

const NOT_IMPLEMENTED_MESSAGE = "Digikala production integration is not yet implemented (no official seller/merchant documentation available).";

/**
 * ============================================================================
 * PROVIDER DOCUMENTATION SAFETY — Digikala (spec sections 20, 58)
 * ============================================================================
 * Official docs source:        UNKNOWN — no Digikala seller/merchant API
 *                               documentation was available to this project
 *                               at implementation time.
 * Auth mechanism:               UNKNOWN.
 * Sandbox availability:         UNKNOWN.
 * Required credentials:         UNKNOWN — `DIGIKALA_BASE_URL`/
 *                               `DIGIKALA_API_KEY` are reserved env vars for
 *                               whenever real credentials/docs become
 *                               available; unused by this adapter today.
 * Listing publish/price/inventory push: UNKNOWN real request/response shape.
 * Order pull/cancellation:      UNKNOWN real request/response shape —
 *                               capabilities below optimistically mark
 *                               supportsOrderPull/supportsOrderCancellation
 *                               true (a merchant order feed and
 *                               cancellation are typical for a marketplace
 *                               of this kind), but `fetchOrders` below
 *                               always returns an empty list this phase:
 *                               this project's own DEV push/webhook path is
 *                               what every H09 ingestion test exercises,
 *                               never Digikala's real feed.
 * Webhooks:                     UNKNOWN — capabilities mark supportsWebhooks
 *                               false since this project could not confirm
 *                               Digikala pushes seller-facing order webhooks
 *                               at all; `verifyWebhook` below always
 *                               returns invalid.
 * Idempotency support:          UNKNOWN.
 * Reconciliation/status query:  UNKNOWN.
 *
 * Because none of the above is confirmed, this adapter does NOT call any
 * real Digikala endpoint, invent a request/response shape, or claim a
 * production integration. Every method below delegates to the same
 * generic, clearly-labeled simulation engine DevMarketplaceAdapter uses
 * (see marketplace-simulation.util.ts) — this proves the
 * SalesChannelAdapter/registry/orchestrator boundary genuinely supports a
 * fourth provider shape without any Seller OS/Offer/Inventory code change,
 * while never presenting a simulated field/status name as a real Digikala
 * API value. Replacing this file's internals with a real HTTP client is the
 * only change a credentialed integration would need.
 * ============================================================================
 */
@Injectable()
export class DigikalaAdapter implements SalesChannelAdapter {
  readonly provider = MarketplaceProvider.DIGIKALA;
  readonly capabilities = MARKETPLACE_PROVIDER_CAPABILITIES[MarketplaceProvider.DIGIKALA];

  private readonly listings = new Map<string, { priceIrr: number; availableQuantity: number; active: boolean }>();

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private isProductionConfigured(): boolean {
    return (
      this.config.get("MARKETPLACE_SANDBOX_MODE", { infer: true }) === "production" &&
      !!this.config.get("DIGIKALA_BASE_URL", { infer: true }) &&
      !!this.config.get("DIGIKALA_API_KEY", { infer: true })
    );
  }

  async publishListing(input: PublishListingInput): Promise<PublishListingResult> {
    if (this.isProductionConfigured()) return { status: "REJECTED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    const result = simulatePublishListing(input, "digikala");
    if (result.status === "PUBLISHED" && result.externalListingId) {
      this.listings.set(result.externalListingId, { priceIrr: input.priceIrr, availableQuantity: input.availableQuantity, active: true });
    }
    return result;
  }

  async updateListing(input: UpdateListingInput): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    if (!this.listings.has(input.externalListingId)) return { status: "FAILED", failureMessage: "Unknown listing." };
    return simulateApply(input.mode);
  }

  async deactivateListing(externalListingId: string): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    const listing = this.listings.get(externalListingId);
    if (!listing) return { status: "FAILED", failureMessage: "Unknown listing." };
    listing.active = false;
    return { status: "APPLIED" };
  }

  async updatePrice(input: UpdatePriceInput): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    const listing = this.listings.get(input.externalListingId);
    if (!listing) return { status: "FAILED", failureMessage: "Unknown listing." };
    const result = simulateApply(input.mode);
    if (result.status === "APPLIED") listing.priceIrr = input.priceIrr;
    return result;
  }

  async updateInventory(input: UpdateInventoryInput): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    const listing = this.listings.get(input.externalListingId);
    if (!listing) return { status: "FAILED", failureMessage: "Unknown listing." };
    const result = simulateApply(input.mode);
    if (result.status === "APPLIED") listing.availableQuantity = input.availableQuantity;
    return result;
  }

  async fetchListingStatus(externalListingId: string): Promise<FetchListingStatusResult> {
    const listing = this.listings.get(externalListingId);
    if (!listing) return { externalListingId, rawStatus: "unknown" };
    return { externalListingId, rawStatus: listing.active ? "active" : "paused", observedPriceIrr: listing.priceIrr, observedInventory: listing.availableQuantity };
  }

  /** Always empty this phase — see class doc comment. Every H09 order-ingestion test exercises DevMarketplaceAdapter's push/webhook path instead. */
  async fetchOrders(): Promise<FetchedMarketplaceOrder[]> {
    return [];
  }

  async acknowledgeOrder(): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    return { status: "APPLIED" };
  }

  async cancelOrder(): Promise<MarketplaceOperationResult> {
    if (this.isProductionConfigured()) return { status: "FAILED", failureMessage: NOT_IMPLEMENTED_MESSAGE };
    return { status: "APPLIED" };
  }

  async reconcile(input: ReconcileListingInput): Promise<ReconcileListingResult> {
    const listing = this.listings.get(input.externalListingId);
    if (!listing) return {};
    return { observedPriceIrr: listing.priceIrr, observedInventory: listing.availableQuantity, observedStatus: listing.active ? "active" : "paused" };
  }

  /** Never called — supportsWebhooks is false for Digikala (see class doc comment). */
  async verifyWebhook(_input: MarketplaceWebhookInput): Promise<MarketplaceWebhookResult> {
    return { valid: false };
  }
}
