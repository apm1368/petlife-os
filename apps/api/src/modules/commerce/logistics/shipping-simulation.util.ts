import { randomUUID } from "node:crypto";
import { ShipmentStatus } from "@prisma/client";
import type { CreateShipmentInput, CreateShipmentResult, ShippingQuoteRequestInput, ShippingQuoteRequestResult } from "./shipping-gateway.interface";

/**
 * Deterministic, no-external-network simulation engine shared by
 * DevShippingAdapter, AloPeykAdapter, and SnappBoxAdapter (spec section 13:
 * "the entire logistics flow testable without external credentials" — and,
 * per README "Provider integration status", ALOPEYK/SNAPPBOX have no
 * official docs available to this project, so their adapters run this same
 * generic, clearly-labeled simulation rather than inventing real-looking
 * endpoint/status behavior). Price/ETA/expiration are fixed constants — "no
 * randomness in tests" (spec section 13) — only opaque ids use randomUUID.
 */

const PROGRESSION: ShipmentStatus[] = [
  ShipmentStatus.CREATED,
  ShipmentStatus.REQUESTED,
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
];

/** The next stage in the normal happy-path progression, or `current` unchanged if already terminal/unrecognized — never throws, never guesses backwards. */
export function nextSimulatedStatus(current: ShipmentStatus): ShipmentStatus {
  const index = PROGRESSION.indexOf(current);
  if (index === -1 || index === PROGRESSION.length - 1) return current;
  return PROGRESSION[index + 1] ?? current;
}

const BASE_STANDARD_PRICE_IRR = 350_000;
const BASE_EXPRESS_PRICE_IRR = 700_000;

export function simulateQuote(input: ShippingQuoteRequestInput, providerPrefix: string): ShippingQuoteRequestResult {
  if (input.mode === "FAILURE") {
    return { status: "UNAVAILABLE", quotes: [], unavailableReason: "Simulated: no service available to this address." };
  }
  return {
    status: "AVAILABLE",
    quotes: [
      {
        serviceLevel: "STANDARD",
        priceIrr: BASE_STANDARD_PRICE_IRR,
        estimatedPickupMinutes: 120,
        estimatedDeliveryMinutes: 24 * 60,
        providerQuoteId: `${providerPrefix}-quote-${randomUUID()}`,
        expiresInMinutes: 30,
      },
      {
        serviceLevel: "EXPRESS",
        priceIrr: BASE_EXPRESS_PRICE_IRR,
        estimatedPickupMinutes: 60,
        estimatedDeliveryMinutes: 4 * 60,
        providerQuoteId: `${providerPrefix}-quote-${randomUUID()}`,
        expiresInMinutes: 30,
      },
    ],
  };
}

export function simulateCreateShipment(input: CreateShipmentInput, providerPrefix: string): CreateShipmentResult {
  if (input.mode === "FAILURE") {
    return { status: "FAILED", failureMessage: "Simulated: provider could not accept this delivery request." };
  }
  const providerShipmentId = `${providerPrefix}-shp-${randomUUID()}`;
  return {
    status: "CREATED",
    providerShipmentId,
    trackingCode: `TRK-${providerShipmentId.slice(-8).toUpperCase()}`,
    estimatedPickupAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    estimatedDeliveryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}
