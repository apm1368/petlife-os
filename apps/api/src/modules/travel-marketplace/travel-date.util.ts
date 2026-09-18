import { InvalidTravelDateRangeException } from "../../common/errors/api-exception";

/** The longest stay the marketplace accepts in one booking. */
export const MAX_BOOKING_NIGHTS = 60;

/**
 * Every travel date in this domain is date-only: the night of 2026-03-01 is
 * the same night whether the traveller's phone says +03:30 or UTC. Storing it
 * at UTC midnight is what makes `@@unique([unitId, night, slot])` a real
 * guarantee — two clients in different timezones must produce the same key
 * for the same night, or the constraint protects nothing.
 */
export function toUtcMidnight(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new InvalidTravelDateRangeException({ value: String(value) });
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** ISO yyyy-mm-dd, the wire format for every date in the travel DTOs. */
export function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The nights a stay actually occupies: check-in night through the night
 * before check-out. A guest checking in on the 1st and out on the 3rd sleeps
 * two nights (1st, 2nd) and never holds the 3rd — that is why the range is
 * half-open.
 */
export function enumerateNights(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  for (let cursor = checkIn; cursor.getTime() < checkOut.getTime(); cursor = addDays(cursor, 1)) {
    nights.push(cursor);
  }
  return nights;
}

/**
 * Validates and normalizes a requested range. `perTrip` inventory (a taxi
 * ride, an airport transfer) occupies exactly its one date, so check-out is
 * pinned to check-in + 1 day and it always resolves to a single held night.
 */
export function resolveStayRange(checkInInput: Date | string, checkOutInput: Date | string, perTrip: boolean): { checkIn: Date; checkOut: Date; nights: Date[] } {
  const checkIn = toUtcMidnight(checkInInput);
  const checkOut = perTrip ? addDays(checkIn, 1) : toUtcMidnight(checkOutInput);

  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new InvalidTravelDateRangeException({ reason: "CHECKOUT_NOT_AFTER_CHECKIN", checkIn: toDateKey(checkIn), checkOut: toDateKey(checkOut) });
  }

  const nights = enumerateNights(checkIn, checkOut);
  if (nights.length > MAX_BOOKING_NIGHTS) {
    throw new InvalidTravelDateRangeException({ reason: "RANGE_TOO_LONG", nights: nights.length, maxNights: MAX_BOOKING_NIGHTS });
  }

  return { checkIn, checkOut, nights };
}
