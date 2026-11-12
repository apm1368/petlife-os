import type { AddressSnapshotDto, OpetlifeCourierConfig, PostPishtazConfig, ShippingPricingBasis } from "@petlife/types";

export const DEFAULT_COURIER_CONFIG: OpetlifeCourierConfig = {
  cities: [],
  baseFareIrr: 0,
  perKmIrr: 0,
  minFareIrr: 0,
  maxKm: 40,
  roadFactor: 1.3,
  cityFlatFareIrr: {},
  defaultFlatFareIrr: 0,
  pickupMinutes: 45,
  minutesPerKm: 4,
};

export const DEFAULT_POST_CONFIG: PostPishtazConfig = { fixedPriceIrr: 0, includedKg: 1, perExtraKgIrr: 0, etaDaysMin: 2, etaDaysMax: 5 };

const IRR_MAX = 100_000_000;
const int = (v: unknown, fallback: number, max = IRR_MAX) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback);
const cleanCity = (c: string) => c.trim().replace(/\s+/g, " ");

/** Accepts staff input, keeps only well-formed numbers; anything malformed falls back to the safe default. */
export function parseCourierConfig(raw: unknown): OpetlifeCourierConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fares: Record<string, number> = {};
  if (r.cityFlatFareIrr && typeof r.cityFlatFareIrr === "object") {
    for (const [city, fare] of Object.entries(r.cityFlatFareIrr as Record<string, unknown>)) {
      const name = cleanCity(city);
      if (name && typeof fare === "number" && Number.isInteger(fare) && fare > 0 && fare <= IRR_MAX) fares[name] = fare;
    }
  }
  return {
    cities: Array.isArray(r.cities) ? [...new Set(r.cities.filter((c): c is string => typeof c === "string" && !!cleanCity(c)).map(cleanCity))].slice(0, 100) : [],
    baseFareIrr: int(r.baseFareIrr, DEFAULT_COURIER_CONFIG.baseFareIrr),
    perKmIrr: int(r.perKmIrr, DEFAULT_COURIER_CONFIG.perKmIrr),
    minFareIrr: int(r.minFareIrr, DEFAULT_COURIER_CONFIG.minFareIrr),
    maxKm: num(r.maxKm, DEFAULT_COURIER_CONFIG.maxKm, 1, 500),
    roadFactor: num(r.roadFactor, DEFAULT_COURIER_CONFIG.roadFactor, 1, 3),
    cityFlatFareIrr: fares,
    defaultFlatFareIrr: int(r.defaultFlatFareIrr, DEFAULT_COURIER_CONFIG.defaultFlatFareIrr),
    pickupMinutes: int(r.pickupMinutes, DEFAULT_COURIER_CONFIG.pickupMinutes, 24 * 60),
    minutesPerKm: num(r.minutesPerKm, DEFAULT_COURIER_CONFIG.minutesPerKm, 0.5, 60),
  };
}

export function parsePostConfig(raw: unknown): PostPishtazConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const etaDaysMin = int(r.etaDaysMin, DEFAULT_POST_CONFIG.etaDaysMin, 60);
  return {
    fixedPriceIrr: int(r.fixedPriceIrr, DEFAULT_POST_CONFIG.fixedPriceIrr),
    includedKg: num(r.includedKg, DEFAULT_POST_CONFIG.includedKg, 0, 100),
    perExtraKgIrr: int(r.perExtraKgIrr, DEFAULT_POST_CONFIG.perExtraKgIrr),
    etaDaysMin,
    etaDaysMax: Math.max(etaDaysMin, int(r.etaDaysMax, DEFAULT_POST_CONFIG.etaDaysMax, 60)),
  };
}

/** A configuration staff can switch on: something that produces a positive price. */
export function courierConfigUsable(c: OpetlifeCourierConfig): boolean {
  return (c.perKmIrr > 0 || c.baseFareIrr > 0) || c.defaultFlatFareIrr > 0 || Object.keys(c.cityFlatFareIrr).length > 0;
}
export function postConfigUsable(c: PostPishtazConfig): boolean {
  return c.fixedPriceIrr > 0;
}

/** Great-circle distance in km. */
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const point = (a: AddressSnapshotDto) =>
  typeof a.latitude === "number" && typeof a.longitude === "number" && Number.isFinite(a.latitude) && Number.isFinite(a.longitude) ? { latitude: a.latitude, longitude: a.longitude } : null;
const sameCity = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && cleanCity(a) === cleanCity(b);
/** Round up to the next 1,000 toman, as couriers quote. */
const roundIrr = (irr: number) => Math.ceil(irr / 10_000) * 10_000;

export type CourierQuote = { available: true; priceIrr: number; pickupMinutes: number; deliveryMinutes: number; basis: ShippingPricingBasis; km: number | null } | { available: false; reason: string };

/**
 * opetlife courier: same-city delivery only. With both map points: base + per-km x (straight line x road factor),
 * never below the minimum, never beyond maxKm. Without them: the city's flat fare, else the default flat fare.
 */
export function quoteCourier(c: OpetlifeCourierConfig, pickup: AddressSnapshotDto, delivery: AddressSnapshotDto): CourierQuote {
  if (!delivery.city) return { available: false, reason: "DELIVERY_CITY_UNKNOWN" };
  if (c.cities.length && !c.cities.some((city) => sameCity(city, delivery.city))) return { available: false, reason: "CITY_NOT_SERVED" };
  if (pickup.city && !sameCity(pickup.city, delivery.city)) return { available: false, reason: "INTERCITY" };
  const from = point(pickup);
  const to = point(delivery);
  if (from && to && (c.perKmIrr > 0 || c.baseFareIrr > 0)) {
    const km = haversineKm(from, to) * c.roadFactor;
    if (km > c.maxKm) return { available: false, reason: "TOO_FAR" };
    const priceIrr = roundIrr(Math.max(c.minFareIrr, c.baseFareIrr + c.perKmIrr * km));
    if (priceIrr <= 0) return { available: false, reason: "NOT_PRICED" };
    return { available: true, priceIrr, pickupMinutes: c.pickupMinutes, deliveryMinutes: c.pickupMinutes + Math.ceil(km * c.minutesPerKm), basis: "DISTANCE_ESTIMATE", km: Math.round(km * 10) / 10 };
  }
  const cityKey = Object.keys(c.cityFlatFareIrr).find((city) => sameCity(city, delivery.city));
  const flat = cityKey ? c.cityFlatFareIrr[cityKey]! : c.defaultFlatFareIrr;
  if (flat <= 0) return { available: false, reason: "NEEDS_MAP_POINT" };
  return { available: true, priceIrr: flat, pickupMinutes: c.pickupMinutes, deliveryMinutes: c.pickupMinutes + 120, basis: "CITY_FLAT", km: null };
}

/** Post Pishtaz: the staff-set fixed price, plus each started kilo above the included weight. */
export function quotePost(c: PostPishtazConfig, weightGrams: number | undefined): { priceIrr: number; deliveryMinutes: number } | null {
  if (c.fixedPriceIrr <= 0) return null;
  const extraKg = weightGrams && weightGrams > c.includedKg * 1000 ? Math.ceil((weightGrams - c.includedKg * 1000) / 1000) : 0;
  return { priceIrr: c.fixedPriceIrr + extraKg * c.perExtraKgIrr, deliveryMinutes: c.etaDaysMax * 24 * 60 };
}
