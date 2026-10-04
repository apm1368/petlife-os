/**
 * Pet-taxi fare from distance — integer IRR only, never floats for money.
 *   fare = baseFare + ceil(perKmRate × metres / 1000) + serviceAdjustment, then at least minimumFare.
 * The per-km part rounds up to a whole rial so a fare never under-charges a fraction. The adjustment may
 * be negative (a discount) but the result is never below zero. Server-side only; the client never
 * supplies a price.
 */
export interface TransportFareInput {
  baseFareIrr: number;
  perKmRateIrr: number;
  distanceMeters: number;
  serviceAdjustmentIrr?: number;
  minimumFareIrr?: number | null;
}

export interface TransportFareBreakdown {
  baseFareIrr: number;
  distanceFareIrr: number;
  serviceAdjustmentIrr: number;
  minimumFareIrr: number | null;
  estimatedFareIrr: number;
}

export class InvalidTransportFareInputError extends Error {}

const MAX_DISTANCE_METERS = 500_000; // 500 km — far beyond any intra-city ride; guards overflow and typos.

export function computeTransportFare(input: TransportFareInput): TransportFareBreakdown {
  const { baseFareIrr, perKmRateIrr, distanceMeters } = input;
  const serviceAdjustmentIrr = input.serviceAdjustmentIrr ?? 0;
  const minimumFareIrr = input.minimumFareIrr ?? null;
  for (const [name, value] of Object.entries({ baseFareIrr, perKmRateIrr, distanceMeters, serviceAdjustmentIrr })) {
    if (!Number.isSafeInteger(value)) throw new InvalidTransportFareInputError(`${name} must be an integer`);
  }
  if (baseFareIrr < 0 || perKmRateIrr < 0) throw new InvalidTransportFareInputError("rates cannot be negative");
  if (distanceMeters < 0 || distanceMeters > MAX_DISTANCE_METERS) throw new InvalidTransportFareInputError("distance out of range");
  if (minimumFareIrr !== null && (!Number.isSafeInteger(minimumFareIrr) || minimumFareIrr < 0)) throw new InvalidTransportFareInputError("minimum fare must be a non-negative integer");

  // BigInt keeps rate × metres exact before the division.
  const distanceFareIrr = Number((BigInt(perKmRateIrr) * BigInt(distanceMeters) + 999n) / 1000n);
  const raw = baseFareIrr + distanceFareIrr + serviceAdjustmentIrr;
  const estimatedFareIrr = Math.max(0, minimumFareIrr !== null ? Math.max(raw, minimumFareIrr) : raw);
  if (!Number.isSafeInteger(estimatedFareIrr)) throw new InvalidTransportFareInputError("fare overflow");
  return { baseFareIrr, distanceFareIrr, serviceAdjustmentIrr, minimumFareIrr, estimatedFareIrr };
}

/** Great-circle distance in metres — used only for the labelled STRAIGHT_LINE_DEMO estimate, never as a route. */
export function straightLineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
