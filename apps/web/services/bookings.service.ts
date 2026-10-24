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
  variantId?: string;
  additionalPetIds?: string[];
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

export interface WaitlistEntry {
  id: string;
  petId: string;
  petName: string;
  providerOrganizationId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  variantId: string | null;
  windowStart: string;
  windowEnd: string;
  status: "ACTIVE" | "NOTIFIED" | "BOOKED" | "CANCELLED" | "EXPIRED";
  notifiedAt: string | null;
  createdAt: string;
}

export const bookingsService = {
  createHold: (input: CreateBookingHoldInput) => apiFetch<BookingHoldDto>("/booking-holds", { method: "POST", body: input }),

  confirm: (input: ConfirmBookingInput, idempotencyKey: string) =>
    apiFetch<BookingDto>("/bookings", { method: "POST", body: input, idempotencyKey }),

  list: (filter: { upcoming?: boolean; past?: boolean; cancelled?: boolean; requested?: boolean; petId?: string; serviceId?: string; providerId?: string; from?: string; to?: string } = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === false || value === "") continue;
      search.set(key, String(value));
    }
    const query = search.toString();
    return apiFetch<BookingDto[]>(`/bookings${query ? `?${query}` : ""}`);
  },

  getById: (id: string) => apiFetch<BookingDto>(`/bookings/${id}`),

  cancel: (id: string, reason?: string) => apiFetch<BookingDto>(`/bookings/${id}/cancel`, { method: "POST", body: { reason } }),

  /** Sandbox gateways honor `mode`; real gateways ignore it. The booking confirms only on a real success. */
  pay: (id: string, idempotencyKey: string, mode?: "SUCCESS" | "FAILURE") =>
    apiFetch<BookingDto>(`/bookings/${id}/pay`, { method: "POST", body: { mode }, idempotencyKey }),

  reschedule: (id: string, slotStart: string, idempotencyKey: string, providerUserId?: string | null) =>
    apiFetch<BookingDto>(`/bookings/${id}/reschedule`, { method: "POST", body: { slotStart, providerUserId: providerUserId ?? undefined }, idempotencyKey }),

  cancelFollowing: (id: string, reason?: string) =>
    apiFetch<{ cancelledBookingIds: string[] }>(`/bookings/${id}/cancel-following`, { method: "POST", body: { reason } }),

  review: (id: string, rating: number, body?: string) => apiFetch<{ id: string }>(`/bookings/${id}/review`, { method: "POST", body: { rating, body } }),

  joinWaitlist: (input: { petId: string; providerId: string; serviceId: string; variantId?: string; windowStart: string; windowEnd: string }) =>
    apiFetch<WaitlistEntry>("/waitlist", { method: "POST", body: input }),

  listWaitlist: () => apiFetch<WaitlistEntry[]>("/waitlist"),

  cancelWaitlist: (entryId: string) => apiFetch<WaitlistEntry>(`/waitlist/${entryId}/cancel`, { method: "POST" }),

  recur: (bookingId: string, occurrences: number, intervalWeeks = 1) =>
    apiFetch<{ series: BookingSeriesDto; createdBookingIds: string[]; skippedStarts: string[] }>(`/bookings/${bookingId}/recur`, {
      method: "POST",
      body: { occurrences, intervalWeeks },
    }),
};
