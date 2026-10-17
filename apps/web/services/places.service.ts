import type { PaginatedDto, PetFriendlyPlaceCategory, PetFriendlyPlaceDto, PetSpecies } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ListPlacesInput = {
  page?: number;
  pageSize?: number;
  country?: string;
  city?: string;
  category?: PetFriendlyPlaceCategory;
  species?: PetSpecies;
};

export type NearbyPlacesInput = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  category?: PetFriendlyPlaceCategory;
  species?: PetSpecies;
  page?: number;
  pageSize?: number;
};

/** Public directory + authenticated favorites surface (Handoff 19) — mirrors animalSupportService's own public-read + toQueryString conventions. */
export const placesService = {
  // -- Public (OptionalSessionAuthGuard personalizes isFavorited, never gates) --
  list: (input: ListPlacesInput = {}) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>(`/places${toQueryString(input)}`),
  nearby: (input: NearbyPlacesInput) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>(`/places/nearby${toQueryString(input)}`),
  get: (placeId: string) => apiFetch<PetFriendlyPlaceDto>(`/places/${placeId}`),

  // -- Authenticated favorites -------------------------------------------------
  listFavorites: () => apiFetch<PetFriendlyPlaceDto[]>(`/places/favorites`),
  report: (placeId: string, input: { reason: string; details?: string }) => apiFetch<{ id: string }>(`/places/${placeId}/reports`, { method: "POST", body: input }),
  adminReports: (status = "OPEN") => apiFetch<{ id: string; place: { id: string; name: string; city: string; category: string }; reason: string; details: string | null; status: string; createdAt: string }[]>(`/admin/places/reports?status=${status}`),
  adminResolveReport: (reportId: string, status: "RESOLVED" | "DISMISSED", note?: string) => apiFetch<{ id: string; status: string }>(`/admin/places/reports/${reportId}/resolve`, { method: "POST", body: { status, note } }),
  addFavorite: (placeId: string) => apiFetch<PetFriendlyPlaceDto>(`/places/favorites/${placeId}`, { method: "POST" }),
  removeFavorite: (placeId: string) => apiFetch<void>(`/places/favorites/${placeId}`, { method: "DELETE" }),
};

export const adminPlacesService = {
  list: (input: { page?: number; city?: string } = {}) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>(`/admin/places${toQueryString(input)}`),
  setVerification: (placeId: string, status: "VERIFIED" | "UNVERIFIED" | "SUSPENDED") => apiFetch<PetFriendlyPlaceDto>(`/admin/places/${placeId}/verification`, { method: "POST", body: { status } }),
  setListed: (placeId: string, isPubliclyListed: boolean) => apiFetch<PetFriendlyPlaceDto>(`/admin/places/${placeId}/listing`, { method: "POST", body: { isPubliclyListed } }),
};
