import { applyDecorators } from "@nestjs/common";
import { IsNumber, Max, Min } from "class-validator";
import { ValidationApiException } from "../errors/api-exception";

export type LatLng = { latitude: number; longitude: number };

/** Iran's bounding box (a little looser than the border). A pin outside it is not a real address here. */
export const IRAN_BOUNDS = { south: 25, north: 40, west: 44, east: 63.5 } as const;

export function inIran(p: { latitude?: number | null; longitude?: number | null } | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    p.latitude >= IRAN_BOUNDS.south &&
    p.latitude <= IRAN_BOUNDS.north &&
    p.longitude >= IRAN_BOUNDS.west &&
    p.longitude <= IRAN_BOUNDS.east
  );
}

/** A saved pin's latitude: a finite number inside Iran (400 otherwise). Pair with @IsOptional() where it may be absent or null. */
export const IsIranLatitude = () =>
  applyDecorators(IsNumber({ allowNaN: false, allowInfinity: false }), Min(IRAN_BOUNDS.south, { message: "latitude must be inside Iran" }), Max(IRAN_BOUNDS.north, { message: "latitude must be inside Iran" }));
export const IsIranLongitude = () =>
  applyDecorators(IsNumber({ allowNaN: false, allowInfinity: false }), Min(IRAN_BOUNDS.west, { message: "longitude must be inside Iran" }), Max(IRAN_BOUNDS.east, { message: "longitude must be inside Iran" }));

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 0.01° ≈ 1.1 km: the coarsening used for lost-pet alert areas and approximate business pins. */
export const roundToKm = (degrees: number) => Math.round(degrees * 100) / 100;

/** An approximate point (~1 km) for a pin the public must not see exactly. */
export const coarsePoint = (p: LatLng): LatLng => ({ latitude: roundToKm(p.latitude), longitude: roundToKm(p.longitude) });

/** The only distance members are shown: whole kilometres (0 = under 1 km), never metres. */
export const coarseKm = (km: number) => Math.round(km);

/**
 * The pin rules every write path shares: latitude and longitude come together or not at all, and a new pin is stored
 * only with the person's explicit consent (the picker's checkbox). Returns the pin to store, null to clear it, or
 * undefined when the request does not touch the pin.
 */
export function pinFromInput(input: { latitude?: number | null; longitude?: number | null; locationConsent?: boolean }, field = "latitude"): LatLng | null | undefined {
  const lat = input.latitude;
  const lng = input.longitude;
  if (lat === undefined && lng === undefined) return undefined;
  if (lat === null && lng === null) return null;
  if (typeof lat !== "number" || typeof lng !== "number") throw new ValidationApiException({ field, reason: "PIN_NEEDS_BOTH_COORDINATES" });
  if (!inIran({ latitude: lat, longitude: lng })) throw new ValidationApiException({ field, reason: "PIN_OUTSIDE_IRAN" });
  if (input.locationConsent !== true) throw new ValidationApiException({ field: "locationConsent", reason: "LOCATION_CONSENT_REQUIRED" });
  return { latitude: lat, longitude: lng };
}

// ---------------------------------------------------------------- public precision of business pins

/** Storefronts are shown at their exact pin. Every other provider type is usually someone's home. */
const STOREFRONT_PROVIDER_TYPES = new Set<string>(["VET_CLINIC", "VET_HOSPITAL", "MULTI_SERVICE_PROVIDER", "TRAVEL_ACCOMMODATION"]);
/** Stay types that are usually a private home. */
const HOME_LISTING_TYPES = new Set<string>(["VILLA", "APARTMENT", "RESIDENCE", "BOARDING"]);

export type PinPrecision = "EXACT" | "APPROXIMATE";

/** Whether the public sees a provider location's exact pin: the provider's own choice, else the default for its type. */
export const providerPinIsExact = (orgType: string, pinPublicExact: boolean | null | undefined) => pinPublicExact ?? STOREFRONT_PROVIDER_TYPES.has(orgType);
export const listingPinIsExact = (listingType: string, pinPublicExact: boolean | null | undefined) => pinPublicExact ?? !HOME_LISTING_TYPES.has(listingType);

/** The point the public may see: the exact pin, or a ~1 km approximation for a home-based business. */
export function publicPin(p: { latitude: number | null; longitude: number | null }, exact: boolean): { latitude: number | null; longitude: number | null; pinPrecision: PinPrecision | null } {
  if (p.latitude === null || p.longitude === null) return { latitude: null, longitude: null, pinPrecision: null };
  return exact ? { latitude: p.latitude, longitude: p.longitude, pinPrecision: "EXACT" } : { ...coarsePoint({ latitude: p.latitude, longitude: p.longitude }), pinPrecision: "APPROXIMATE" };
}
