import type { PaginatedDto, TravelBookingDto, TravelListingDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, string | number | undefined>)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Supply-side travel operations, scoped by the API to the active provider organization. */
export const providerTravelService = {
  listListings: (input: { page?: number; pageSize?: number } = {}) => apiFetch<PaginatedDto<TravelListingDto>>(`/provider/travel/listings${toQueryString(input)}`),
  listBookings: (input: { page?: number; pageSize?: number; status?: string } = {}) => apiFetch<PaginatedDto<TravelBookingDto>>(`/provider/travel/bookings${toQueryString(input)}`),
  submitListing: (listingId: string) => apiFetch<TravelListingDto>(`/provider/travel/listings/${listingId}/submit`, { method: "POST" }),
  respondToBooking: (bookingId: string, action: "confirm" | "reject") => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${bookingId}/${action}`, { method: "POST" }),
};
