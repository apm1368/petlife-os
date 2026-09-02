import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ShipmentStatus, ShippingProvider } from "@prisma/client";
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
import { nextSimulatedStatus, simulateCreateShipment, simulateQuote } from "./shipping-simulation.util";
import { normalizeShippingProviderStatus } from "./shipping-status-normalizer";

const CANONICAL_TO_DEV_RAW: Record<ShipmentStatus, string> = {
  CREATED: "created",
  REQUESTED: "requested",
  ASSIGNED: "assigned",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  FAILED: "failed",
  CANCELED: "canceled",
  UNKNOWN: "unknown",
};

const TERMINAL: ReadonlySet<ShipmentStatus> = new Set([ShipmentStatus.DELIVERED, ShipmentStatus.FAILED, ShipmentStatus.CANCELED]);

interface DevSimulatedWebhookBody {
  providerShipmentId?: string;
  providerEventId?: string;
  eventType?: string;
  rawStatus?: string;
  occurredAt?: string;
}

/**
 * Fully functional deterministic dev/test adapter (spec section 13) — the
 * one provider the whole logistics domain can be exercised against with no
 * external credentials. In-memory state only (mirrors DevPaymentGateway
 * from Handoff 07): fine for a single dev/test process, reset on restart,
 * documented as dev/test-only.
 */
@Injectable()
export class DevShippingAdapter implements ShippingGateway {
  readonly provider = ShippingProvider.DEV;
  readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.DEV];

  private readonly simulatedStatus = new Map<string, ShipmentStatus>();

  async getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult> {
    return simulateQuote(input, "dev");
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const result = simulateCreateShipment(input, "dev");
    if (result.status === "CREATED" && result.providerShipmentId) {
      this.simulatedStatus.set(result.providerShipmentId, ShipmentStatus.REQUESTED);
    }
    return result;
  }

  async cancelShipment(providerShipmentId: string): Promise<CancelShipmentResult> {
    const current = this.simulatedStatus.get(providerShipmentId);
    if (!current || TERMINAL.has(current) || current === ShipmentStatus.PICKED_UP || current === ShipmentStatus.IN_TRANSIT || current === ShipmentStatus.OUT_FOR_DELIVERY) {
      return { status: "FAILED", failureMessage: "This shipment can no longer be canceled." };
    }
    this.simulatedStatus.set(providerShipmentId, ShipmentStatus.CANCELED);
    return { status: "CANCELED" };
  }

  async getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatusResult> {
    const current = this.simulatedStatus.get(providerShipmentId) ?? ShipmentStatus.UNKNOWN;
    return { rawStatus: CANONICAL_TO_DEV_RAW[current], canonicalStatus: current };
  }

  async handleWebhook(input: ShippingWebhookInput): Promise<ShippingWebhookResult> {
    // DEV never signs anything — no secret exists to check (mirrors DevPaymentGateway.verifyWebhookSignature, Handoff 07).
    const body = input.rawBody as DevSimulatedWebhookBody | null;
    if (!body || typeof body !== "object" || !body.providerShipmentId || !body.rawStatus) return { valid: false };

    const canonicalStatus = normalizeShippingProviderStatus(ShippingProvider.DEV, body.rawStatus);
    // Keeps the adapter's own "provider-side truth" in sync so a later getShipmentStatus/reconciliation call agrees with a webhook that already arrived.
    this.simulatedStatus.set(body.providerShipmentId, canonicalStatus);

    return {
      valid: true,
      providerShipmentId: body.providerShipmentId,
      providerEventId: body.providerEventId ?? `dev-evt-${randomUUID()}`,
      eventType: body.eventType ?? "shipment.status_changed",
      rawStatus: body.rawStatus,
      canonicalStatus,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    };
  }

  /**
   * Dev/test-only (spec section 13) — never reachable in production, see
   * ShippingDevController's NODE_ENV guard. Advances this shipment's
   * simulated provider-side status and returns a webhook body shaped
   * exactly like what `handleWebhook` above expects, so a caller feeds it
   * through the *real* webhook endpoint rather than mutating state
   * directly — the full webhook/event-processing pipeline still runs.
   */
  buildSimulatedEventPayload(providerShipmentId: string, toStatus?: ShipmentStatus): Record<string, unknown> {
    const current = this.simulatedStatus.get(providerShipmentId) ?? ShipmentStatus.CREATED;
    const next = toStatus ?? nextSimulatedStatus(current);
    return {
      providerShipmentId,
      providerEventId: `dev-evt-${randomUUID()}`,
      eventType: "shipment.status_changed",
      rawStatus: CANONICAL_TO_DEV_RAW[next],
      occurredAt: new Date().toISOString(),
    };
  }
}
