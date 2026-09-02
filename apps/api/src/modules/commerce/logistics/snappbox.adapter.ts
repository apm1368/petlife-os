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
 * PROVIDER DOCUMENTATION SAFETY — SnappBox (spec sections 2, 15)
 * ============================================================================
 * Official docs source:        UNKNOWN — no SnappBox merchant/API
 *                               documentation was available to this project
 *                               at implementation time.
 * Auth mechanism:               UNKNOWN.
 * Sandbox availability:         UNKNOWN.
 * Required credentials:         UNKNOWN — `SNAPPBOX_API_BASE_URL`/
 *                               `SNAPPBOX_API_KEY`/`SNAPPBOX_WEBHOOK_SECRET`
 *                               are reserved env vars for whenever real
 *                               credentials/docs become available; unused by
 *                               this adapter today.
 * Webhook/signature verification: UNKNOWN real scheme — `handleWebhook` below
 *                               always accepts (no real secret exists to
 *                               verify against), exactly like DEV.
 * Idempotency support:          UNKNOWN.
 * Cancel capability:            UNKNOWN.
 * Reconciliation/status query:  UNKNOWN.
 *
 * Same discipline as AloPeykAdapter (see its doc comment for the full
 * rationale): no real endpoint is called, no request/response shape is
 * invented, and no simulated field/status name is presented as a real
 * SnappBox API value. This adapter delegates to the same generic simulation
 * engine as DEV/AloPeyk, proving the registry/orchestrator boundary
 * supports a fourth-and-beyond provider with zero Order/Checkout/
 * Fulfillment code changes.
 * ============================================================================
 */
@Injectable()
export class SnappBoxAdapter implements ShippingGateway {
  readonly provider = ShippingProvider.SNAPPBOX;
  readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.SNAPPBOX];

  private readonly simulatedStatus = new Map<string, ShipmentStatus>();

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private isProductionConfigured(): boolean {
    return this.config.get("SHIPPING_MODE", { infer: true }) === "production" && !!this.config.get("SNAPPBOX_API_BASE_URL", { infer: true }) && !!this.config.get("SNAPPBOX_API_KEY", { infer: true });
  }

  async getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult> {
    if (this.isProductionConfigured()) {
      return { status: "UNAVAILABLE", quotes: [], unavailableReason: "SnappBox production integration is not yet implemented (no official documentation available)." };
    }
    return simulateQuote(input, "snappbox");
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    if (this.isProductionConfigured()) {
      return { status: "FAILED", failureMessage: "SnappBox production integration is not yet implemented (no official documentation available)." };
    }
    const result = simulateCreateShipment(input, "snappbox");
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
    // Real SnappBox webhook signature scheme is UNKNOWN — never verified against a real secret; documented gap (see class doc comment).
    const body = input.rawBody as { providerShipmentId?: string; providerEventId?: string; eventType?: string; rawStatus?: string; occurredAt?: string } | null;
    if (!body || typeof body !== "object" || !body.providerShipmentId || !body.rawStatus) return { valid: false };

    const canonicalStatus = normalizeShippingProviderStatus(ShippingProvider.SNAPPBOX, body.rawStatus);
    this.simulatedStatus.set(body.providerShipmentId, canonicalStatus);

    return {
      valid: true,
      providerShipmentId: body.providerShipmentId,
      providerEventId: body.providerEventId ?? `snappbox-evt-${randomUUID()}`,
      eventType: body.eventType ?? "shipment.status_changed",
      rawStatus: body.rawStatus,
      canonicalStatus,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    };
  }
}
