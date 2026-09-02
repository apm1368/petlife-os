import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { MarketplaceProvider } from "@prisma/client";
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

interface DevListingState {
  priceIrr: number;
  availableQuantity: number;
  active: boolean;
}

interface DevSimulatedOrderItemPayload {
  externalListingId?: string | null;
  sellerSku?: string | null;
  quantity: number;
  unitPriceAmount: number;
  totalPriceAmount?: number;
}

interface DevSimulatedOrderPayload {
  kind?: "ORDER";
  externalOrderId: string;
  rawStatus?: string;
  currency?: string;
  totalAmount?: number;
  items: DevSimulatedOrderItemPayload[];
  buyerSnapshot?: Record<string, unknown>;
  shippingSnapshot?: Record<string, unknown>;
}

interface DevSimulatedCancellationPayload {
  kind: "ORDER_CANCELLATION";
  externalOrderId: string;
}

type DevWebhookPayload = DevSimulatedOrderPayload | DevSimulatedCancellationPayload;

/**
 * Fully functional deterministic dev/test adapter (spec section 21) — the
 * one marketplace provider the whole channel-integration domain can be
 * exercised against with no external credentials. In-memory state only
 * (mirrors DevShippingAdapter/DevPaymentGateway from Handoffs 07/08): fine
 * for a single dev/test process, reset on restart, documented as
 * dev/test-only. Order ingestion is exercised through the push/webhook path
 * (`verifyWebhook`) — see `buildSimulatedOrderPayload`/
 * `buildSimulatedCancellationPayload`, fed through the real webhook
 * simulate endpoint (MarketplaceDevController), never by mutating
 * MarketplaceOrder state directly, the same "still exercise the real
 * pipeline" discipline as DevShippingAdapter.buildSimulatedEventPayload.
 * `fetchOrders` (the pull-path alternative) exists for interface
 * completeness but returns nothing this phase — no test exercises it.
 */
@Injectable()
export class DevMarketplaceAdapter implements SalesChannelAdapter {
  readonly provider = MarketplaceProvider.DEV;
  readonly capabilities = MARKETPLACE_PROVIDER_CAPABILITIES[MarketplaceProvider.DEV];

  private readonly listings = new Map<string, DevListingState>();

  async publishListing(input: PublishListingInput): Promise<PublishListingResult> {
    const result = simulatePublishListing(input, "dev");
    if (result.status === "PUBLISHED" && result.externalListingId) {
      this.listings.set(result.externalListingId, { priceIrr: input.priceIrr, availableQuantity: input.availableQuantity, active: true });
    }
    return result;
  }

  async updateListing(input: UpdateListingInput): Promise<MarketplaceOperationResult> {
    if (!this.listings.has(input.externalListingId)) return { status: "FAILED", failureMessage: "Unknown listing." };
    return simulateApply(input.mode);
  }

  async deactivateListing(externalListingId: string): Promise<MarketplaceOperationResult> {
    const listing = this.listings.get(externalListingId);
    if (!listing) return { status: "FAILED", failureMessage: "Unknown listing." };
    listing.active = false;
    return { status: "APPLIED" };
  }

  async updatePrice(input: UpdatePriceInput): Promise<MarketplaceOperationResult> {
    const listing = this.listings.get(input.externalListingId);
    if (!listing) return { status: "FAILED", failureMessage: "Unknown listing." };
    const result = simulateApply(input.mode);
    if (result.status === "APPLIED") listing.priceIrr = input.priceIrr;
    return result;
  }

  async updateInventory(input: UpdateInventoryInput): Promise<MarketplaceOperationResult> {
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

  async fetchOrders(): Promise<FetchedMarketplaceOrder[]> {
    return [];
  }

  async acknowledgeOrder(): Promise<MarketplaceOperationResult> {
    return { status: "APPLIED" };
  }

  async cancelOrder(): Promise<MarketplaceOperationResult> {
    return { status: "APPLIED" };
  }

  async reconcile(input: ReconcileListingInput): Promise<ReconcileListingResult> {
    const listing = this.listings.get(input.externalListingId);
    if (!listing) return {};
    return { observedPriceIrr: listing.priceIrr, observedInventory: listing.availableQuantity, observedStatus: listing.active ? "active" : "paused" };
  }

  async verifyWebhook(input: MarketplaceWebhookInput): Promise<MarketplaceWebhookResult> {
    // DEV never signs anything — no secret exists to check (mirrors DevShippingAdapter.handleWebhook, Handoff 08).
    const body = input.rawBody as DevWebhookPayload | null;
    if (!body || typeof body !== "object" || !body.externalOrderId) return { valid: false };

    if (body.kind === "ORDER_CANCELLATION") {
      return { valid: true, kind: "ORDER_CANCELLATION", externalOrderId: body.externalOrderId };
    }

    const order: FetchedMarketplaceOrder = {
      externalOrderId: body.externalOrderId,
      rawStatus: body.rawStatus ?? "received",
      currency: body.currency ?? "IRR",
      totalAmount: body.totalAmount ?? body.items.reduce((sum, i) => sum + (i.totalPriceAmount ?? i.unitPriceAmount * i.quantity), 0),
      placedAt: new Date(),
      buyerSnapshot: body.buyerSnapshot,
      shippingSnapshot: body.shippingSnapshot,
      items: body.items.map((i) => ({
        externalListingId: i.externalListingId ?? null,
        sellerSku: i.sellerSku ?? null,
        quantity: i.quantity,
        unitPriceAmount: i.unitPriceAmount,
        totalPriceAmount: i.totalPriceAmount ?? i.unitPriceAmount * i.quantity,
      })),
    };

    return { valid: true, kind: "ORDER", order };
  }

  /** Dev/test-only (spec section 54) — never reachable in production, see MarketplaceDevController's NODE_ENV guard. */
  buildSimulatedOrderPayload(externalOrderId: string, items: DevSimulatedOrderItemPayload[], rawStatus = "received"): DevSimulatedOrderPayload {
    return { kind: "ORDER", externalOrderId: externalOrderId || `dev-order-${randomUUID()}`, rawStatus, items };
  }

  buildSimulatedCancellationPayload(externalOrderId: string): DevSimulatedCancellationPayload {
    return { kind: "ORDER_CANCELLATION", externalOrderId };
  }

  /** Dev/test-only — directly overwrites this listing's *observed* provider-side values without going through updatePrice/updateInventory, simulating a provider that drifted independently of PET LIFE OS (spec section 54: "simulate inventory mismatch"). */
  injectObservedMismatch(externalListingId: string, values: { priceIrr?: number; availableQuantity?: number }): void {
    const listing = this.listings.get(externalListingId);
    if (!listing) return;
    if (values.priceIrr !== undefined) listing.priceIrr = values.priceIrr;
    if (values.availableQuantity !== undefined) listing.availableQuantity = values.availableQuantity;
  }
}
