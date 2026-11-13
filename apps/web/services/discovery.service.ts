import type { ProviderLocationDto, ProviderServiceDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type DiscoverySort = "RECOMMENDED" | "EARLIEST" | "NEAREST" | "TOP_RATED" | "LOWEST_PRICE";

export interface DiscoveryQuery {
  category?: string;
  serviceType?: string;
  q?: string;
  city?: string;
  neighborhood?: string;
  species?: "DOG" | "CAT";
  homeVisit?: boolean;
  minRating?: number;
  maxPrice?: number;
  date?: string;
  /** Only for searchNear (sent in the body, never in a URL). */
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: DiscoverySort;
  /** "home": distances from the member's own pinned default address, looked up by the server. */
  near?: "home";
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface DiscoveryServiceSummary {
  id: string;
  name: string;
  category: string;
  type: string;
  startingPrice: number | null;
  currency: string | null;
  durationMinutes: number;
  homeVisit: boolean;
  bookingMode: string;
}

export interface ProviderDiscoveryResult {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  specialties: string[];
  location: { id: string; city: string; region: string | null; addressLine: string } | null;
  distanceKm: number | null;
  services: DiscoveryServiceSummary[];
  startingPrice: number | null;
  currency: string | null;
  nextAvailableAt: string | null;
  rating: RatingSummary;
  completedBookings: number;
  petTypes: ("DOG" | "CAT")[];
  homeVisit: boolean;
  rankingScore: number;
}

export interface PublicReview {
  id: string;
  rating: number;
  body: string | null;
  authorName: string;
  serviceName: string | null;
  providerResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  galleryUrls: string[];
  specialties: string[];
  policiesText: string | null;
  faqs: { question: string; answer: string }[];
  phone: string | null;
  websiteUrl: string | null;
  locations: ProviderLocationDto[];
  services: (ProviderServiceDto & { startingPrice: number | null; homeVisit: boolean; staffIds: string[] })[];
  team: { providerUserId: string; displayName: string | null; avatarUrl: string | null; displayTitle: string | null; publicBio: string | null; role: "VET" | "STAFF"; serviceIds: string[] }[];
  rating: RatingSummary;
  reviews: PublicReview[];
  completedBookings: number;
  petTypes: string[];
  homeVisit: boolean;
}

function qs(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const discoveryService = {
  search: ({ lat: _lat, lng: _lng, ...query }: DiscoveryQuery) => apiFetch<{ total: number; items: ProviderDiscoveryResult[]; origin?: "HOME" | "POINT" | null }>(`/discovery/providers${qs(query)}`),
  /** "Near me": the browser's point (already rounded to ~1 km) goes in the POST body, so it never lands in a URL or access log. */
  searchNear: ({ near: _near, ...query }: DiscoveryQuery & { lat: number; lng: number }) =>
    apiFetch<{ total: number; items: ProviderDiscoveryResult[]; origin?: "HOME" | "POINT" | null }>("/discovery/providers/near", { method: "POST", body: { ...query, ...(query.homeVisit ? { homeVisit: "true" } : { homeVisit: undefined }) } }),
  profile: (providerId: string) => apiFetch<ProviderProfile>(`/discovery/providers/${providerId}`),
  cities: () => apiFetch<string[]>("/discovery/cities"),
  favorites: () => apiFetch<{ id: string; name: string; type: string; logoUrl: string | null; savedAt: string }[]>("/me/favorite-providers"),
  favorite: (providerId: string) => apiFetch<void>(`/providers/${providerId}/favorite`, { method: "PUT" }),
  unfavorite: (providerId: string) => apiFetch<void>(`/providers/${providerId}/favorite`, { method: "DELETE" }),
};
