import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ShipmentStatus, ShippingProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  ShipmentStatusResult,
  ShippingGateway,
  ShippingQuoteRequestInput,
  ShippingQuoteRequestResult,
  ShippingWebhookInput,
  ShippingWebhookResult,
} from "./shipping-gateway.interface";
import { SHIPPING_PROVIDER_CAPABILITIES } from "./shipping-provider-registry";
import { simulateCreateShipment, simulateQuote } from "./shipping-simulation.util";
import { normalizeShippingProviderStatus } from "./shipping-status-normalizer";

/**
 * ============================================================================
 * PROVIDER DOCUMENTATION SAFETY — AloPeyk (spec sections 2, 14)
 * ============================================================================
 * Official docs source:        UNKNOWN — no AloPeyk merchant/API documentation
 *                               was available to this project at implementation
 *                               time.
 * Auth mechanism:               UNKNOWN.
 * Sandbox availability:         UNKNOWN.
 * Required credentials:         UNKNOWN — `ALOPEYK_API_BASE_URL`/
 *                               `ALOPEYK_API_KEY`/`ALOPEYK_WEBHOOK_SECRET` are
 *                               reserved env vars for whenever real
 *                               credentials/docs become available; unused by
 *                               this adapter today.
 * Webhook/signature verification: UNKNOWN real scheme — `handleWebhook` below
 *                               always accepts (no real secret exists to
 *                               verify against), exactly like DEV.
 * Idempotency support:          UNKNOWN.
 * Cancel capability:            UNKNOWN.
 * Reconciliation/status query:  UNKNOWN.
 *
 * Because none of the above is confirmed, this adapter does NOT call any
 * real AloPeyk endpoint, invent a request/response shape, or claim a
 * production integration. Every method below delegates to the same generic,
 * clearly-labeled simulation engine DevShippingAdapter uses (see
 * shipping-simulation.util.ts) — this proves the ShippingGateway/registry/
 * orchestrator boundary genuinely supports a third provider without any
 * Order/Checkout/Fulfillment code change (spec section 1's core
 * requirement), while never presenting a simulated field/status name as a
 * real AloPeyk API value. Replacing this file's internals with a real HTTP
 * client is the only change a credentialed integration would need.
 * ============================================================================
 */
@Injectable()
export class AloPeykAdapter implements ShippingGateway {
  readonly provider = ShippingProvider.ALOPEYK;
  readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.ALOPEYK];

  private readonly simulatedStatus = new Map<string, ShipmentStatus>();

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private isProductionConfigured(): boolean {
    return this.config.get("SHIPPING_MODE", { infer: true }) === "production" && !!this.config.get("ALOPEYK_API_BASE_URL", { infer: true }) && !!this.config.get("ALOPEYK_API_KEY", { infer: true });
  }

  async getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult> {
    if (this.isProductionConfigured()) {
      // No official docs to build a real request from — see class doc comment. Never silently fabricate a production quote.
      return { status: "UNAVAILABLE", quotes: [], unavailableReason: "AloPeyk production integration is not yet implemented (no official documentation available)." };
    }
    return simulateQuote(input, "alopeyk");
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    if (this.isProductionConfigured()) {
      return { status: "FAILED", failureMessage: "AloPeyk production integration is not yet implemented (no official documentation available)." };
    }
    const result = simulateCreateShipment(input, "alopeyk");
    if (result.status === "CREATED" && result.providerShipmentId) this.simulatedStatus.set(result.providerShipmentId, ShipmentStatus.REQUESTED);
    return result;
  }

  async cancelShipment(providerShipmentId: string): Promise<CancelShipmentResult> {
    const current = this.simulatedStatus.get(providerShipmentId);
    if (!current || current === ShipmentStatus.DELIVERED || current === ShipmentStatus.FAILED || current === ShipmentStatus.CANCELED) {
      return { status: "FAILED", failureMessage: "This shipment can no longer be canceled." };
    }
    this.simulatedStatus.set(providerShipmentId, ShipmentStatus.CANCELED);
    return { status: "CANCELED" };
  }

  async getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatusResult> {
    const current = this.simulatedStatus.get(providerShipmentId) ?? ShipmentStatus.UNKNOWN;
    return { rawStatus: current.toLowerCase(), canonicalStatus: current };
  }

  async handleWebhook(input: ShippingWebhookInput): Promise<ShippingWebhookResult> {
    // Real AloPeyk webhook signature scheme is UNKNOWN — never verified against a real secret; documented gap (see class doc comment).
    const body = input.rawBody as { providerShipmentId?: string; providerEventId?: string; eventType?: string; rawStatus?: string; occurredAt?: string } | null;
    if (!body || typeof body !== "object" || !body.providerShipmentId || !body.rawStatus) return { valid: false };

    const canonicalStatus = normalizeShippingProviderStatus(ShippingProvider.ALOPEYK, body.rawStatus);
    this.simulatedStatus.set(body.providerShipmentId, canonicalStatus);

    return {
      valid: true,
      providerShipmentId: body.providerShipmentId,
      providerEventId: body.providerEventId ?? `alopeyk-evt-${randomUUID()}`,
      eventType: body.eventType ?? "shipment.status_changed",
      rawStatus: body.rawStatus,
      canonicalStatus,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    };
  }
}
