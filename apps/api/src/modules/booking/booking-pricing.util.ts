/**
 * Multi-pet booking rules (owner, 2026-11-13). One place for the API; apps/web/features/booking-flow/booking-price.ts
 * mirrors it for the summary shown before confirming.
 *
 * - Pet taxi: the price is per ride, however many pets ride (up to the vehicle's capacity, the service's
 *   maxPetsPerBooking).
 * - Boarding and sitting: per night (or day) per pet.
 * - Grooming, vet and training: per pet, and the appointment runs pets one after another, so it lasts the service
 *   duration × the number of pets.
 * - Walking and other services: per pet, same slot length.
 */
export const PER_RIDE_CATEGORIES = ["PET_TAXI"] as const;
export const PER_NIGHT_CATEGORIES = ["BOARDING", "SITTING"] as const;
export const SEQUENTIAL_CATEGORIES = ["GROOMING", "VET", "TRAINING"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPerRide(category: string, locationMode?: string | null): boolean {
  return (PER_RIDE_CATEGORIES as readonly string[]).includes(category) || locationMode === "TRANSPORT";
}

/** How many minutes a booking of `petCount` pets occupies. */
export function bookingSpanMinutes(category: string, durationMinutes: number, petCount: number): number {
  return (SEQUENTIAL_CATEGORIES as readonly string[]).includes(category) ? durationMinutes * Math.max(1, petCount) : durationMinutes;
}

/** Nights (boarding) or days (sitting) between check-in and check-out, at least one. */
export function stayNights(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

export interface BookingPriceInput {
  category: string;
  locationMode?: string | null;
  unitPrice: number | null;
  petCount: number;
  start: Date;
  end: Date;
  /** A distance-priced taxi fare computed by the server, when it applies. */
  distanceFare?: number | null;
}

export interface BookingPriceBreakdown {
  total: number | null;
  unitPrice: number | null;
  /** How many units are charged: 1 for a taxi ride, pets × nights for a stay, pets otherwise. */
  quantity: number;
  basis: "PER_RIDE" | "PER_PET_NIGHT" | "PER_PET";
  nights: number | null;
}

export function bookingPrice(input: BookingPriceInput): BookingPriceBreakdown {
  const pets = Math.max(1, input.petCount);
  if (isPerRide(input.category, input.locationMode)) {
    const fare = input.distanceFare ?? input.unitPrice;
    return { total: fare ?? null, unitPrice: fare ?? null, quantity: 1, basis: "PER_RIDE", nights: null };
  }
  if ((PER_NIGHT_CATEGORIES as readonly string[]).includes(input.category)) {
    const nights = stayNights(input.start, input.end);
    return { total: input.unitPrice === null ? null : input.unitPrice * pets * nights, unitPrice: input.unitPrice, quantity: pets * nights, basis: "PER_PET_NIGHT", nights };
  }
  return { total: input.unitPrice === null ? null : input.unitPrice * pets, unitPrice: input.unitPrice, quantity: pets, basis: "PER_PET", nights: null };
}
