import type { PaginatedDto, TravelBookingDto, TravelInventoryUnitDto, TravelListingDto, TravelListingType } from "@petlife/types";
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
  createListing: (input: { type: TravelListingType; title: string; description: string; country: string; city: string; address?: string }) =>
    apiFetch<TravelListingDto>("/provider/travel/listings", { method: "POST", body: input }),
  createUnit: (listingId: string, input: { name: string; basePriceIrr: number; quantity?: number; maxOccupancy?: number }) =>
    apiFetch<TravelInventoryUnitDto>(`/provider/travel/listings/${listingId}/units`, { method: "POST", body: input }),
  respondToBooking: (bookingId: string, action: "confirm" | "reject") => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${bookingId}/${action}`, { method: "POST" }),
};
