import type { BookingDto, BookingHoldDto, BookingSeriesDto, PetAccessScopePreset } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateBookingHoldInput {
  petId: string;
  providerId: string;
  locationId: string;
  serviceId: string;
  /** Fixed-slot categories — mutually exclusive with rangeStart/rangeEnd. */
  slotStart?: string;
  /** Date-range categories (Sitting/Boarding) — mutually exclusive with slotStart. */
  rangeStart?: string;
  rangeEnd?: string;
  providerUserId?: string | null;
}

export interface ConfirmBookingInput {
  holdId: string;
  petId: string;
  reasonForVisit?: string;
  ownerNotes?: string;
  accessSelection?: PetAccessScopePreset;
  customerAddressId?: string;
  dropoffAddressId?: string;
}

export const bookingsService = {
  createHold: (input: CreateBookingHoldInput) => apiFetch<BookingHoldDto>("/booking-holds", { method: "POST", body: input }),

  confirm: (input: ConfirmBookingInput, idempotencyKey: string) =>
    apiFetch<BookingDto>("/bookings", { method: "POST", body: input, idempotencyKey }),

  list: (filter: { upcoming?: boolean; past?: boolean; cancelled?: boolean; petId?: string } = {}) => {
    const search = new URLSearchParams();
    if (filter.upcoming) search.set("upcoming", "true");
    if (filter.past) search.set("past", "true");
    if (filter.cancelled) search.set("cancelled", "true");
    if (filter.petId) search.set("petId", filter.petId);
    const query = search.toString();
    return apiFetch<BookingDto[]>(`/bookings${query ? `?${query}` : ""}`);
  },

  getById: (id: string) => apiFetch<BookingDto>(`/bookings/${id}`),

  cancel: (id: string, reason?: string) => apiFetch<BookingDto>(`/bookings/${id}/cancel`, { method: "POST", body: { reason } }),

  recur: (bookingId: string, occurrences: number) =>
    apiFetch<{ series: BookingSeriesDto; createdBookingIds: string[]; skippedStarts: string[] }>(`/bookings/${bookingId}/recur`, {
      method: "POST",
      body: { occurrences },
    }),
};
