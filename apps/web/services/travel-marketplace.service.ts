import type {
  PaginatedDto,
  TravelAvailabilityDayDto,
  TravelListingDto,
  TravelListingType,
  TravelQuoteDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, string | number | boolean | undefined>)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface TravelSearchInput {
  page?: number;
  pageSize?: number;
  city?: string;
  country?: string;
  type?: TravelListingType;
  search?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  dogsAllowed?: boolean;
  catsAllowed?: boolean;
}

/** Public marketplace reads are deliberately separate from the private Trip APIs. */
export const travelMarketplaceService = {
  search: (input: TravelSearchInput = {}) => apiFetch<PaginatedDto<TravelListingDto>>(`/travel/listings${toQueryString(input)}`),
  listCities: () => apiFetch<Array<{ country: string; city: string }>>("/travel/listings/cities"),
  getListing: (listingId: string) => apiFetch<TravelListingDto>(`/travel/listings/${listingId}`),
  availability: (listingId: string, unitId: string, fromDate: string, toDate: string) =>
    apiFetch<TravelAvailabilityDayDto[]>(`/travel/listings/${listingId}/units/${unitId}/availability${toQueryString({ fromDate, toDate })}`),
  quote: (listingId: string, input: { unitId: string; checkIn: string; checkOut: string; petCount?: number }) =>
    apiFetch<TravelQuoteDto>(`/travel/listings/${listingId}/quote${toQueryString(input)}`),
};
