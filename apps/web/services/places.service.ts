import type { PaginatedDto, PetFriendlyPlaceCategory, PetFriendlyPlaceDto, PetSpecies, PlaceClaimResultDto } from "@petlife/types";
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
  /** "Near me": the browser's point goes in the POST body (rounded to ~1 km by the caller), never in a URL or access log. */
  nearby: (input: NearbyPlacesInput) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>("/places/nearby", { method: "POST", body: input }),
  /** Near the member's own pinned default address (looked up by the server; 400 HOME_PIN_MISSING without one). */
  nearHome: (input: Omit<NearbyPlacesInput, "latitude" | "longitude"> = {}) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>(`/places/nearby${toQueryString({ ...input, near: "home" })}`),
  get: (placeId: string) => apiFetch<PetFriendlyPlaceDto>(`/places/${placeId}`),

  // -- Authenticated favorites -------------------------------------------------
  listFavorites: () => apiFetch<PetFriendlyPlaceDto[]>(`/places/favorites`),
  report: (placeId: string, input: { reason: string; details?: string }) => apiFetch<{ id: string }>(`/places/${placeId}/reports`, { method: "POST", body: input }),
  adminReports: (status = "OPEN") => apiFetch<{ id: string; place: { id: string; name: string; city: string; category: string }; reason: string; details: string | null; status: string; createdAt: string }[]>(`/admin/places/reports?status=${status}`),
  adminResolveReport: (reportId: string, status: "RESOLVED" | "DISMISSED", note?: string) => apiFetch<{ id: string; status: string }>(`/admin/places/reports/${reportId}/resolve`, { method: "POST", body: { status, note } }),
  // -- "Is this your business? Claim it" (signed in) ---------------------------
  claim: (placeId: string, message?: string) => apiFetch<PlaceClaimResultDto>(`/places/${placeId}/claim`, { method: "POST", body: { message } }),
  myClaim: (placeId: string) => apiFetch<{ claim: PlaceClaimResultDto | null }>(`/places/${placeId}/claim`),
  addFavorite: (placeId: string) => apiFetch<PetFriendlyPlaceDto>(`/places/favorites/${placeId}`, { method: "POST" }),
  removeFavorite: (placeId: string) => apiFetch<void>(`/places/favorites/${placeId}`, { method: "DELETE" }),
};

export const adminPlacesService = {
  list: (input: { page?: number; city?: string } = {}) => apiFetch<PaginatedDto<PetFriendlyPlaceDto>>(`/admin/places${toQueryString(input)}`),
  update: (placeId: string, input: { name?: string; city?: string }) => apiFetch<PetFriendlyPlaceDto>(`/admin/places/${placeId}`, { method: "PATCH", body: input }),
  setVerification: (placeId: string, status: "VERIFIED" | "UNVERIFIED" | "SUSPENDED") => apiFetch<PetFriendlyPlaceDto>(`/admin/places/${placeId}/verification`, { method: "POST", body: { status } }),
  setListed: (placeId: string, isPubliclyListed: boolean) => apiFetch<PetFriendlyPlaceDto>(`/admin/places/${placeId}/listing`, { method: "POST", body: { isPubliclyListed } }),
};

export type OsmImportRunDto = { id: string; status: "RUNNING" | "SUCCEEDED" | "FAILED" | "RATE_LIMITED"; fetched: number; created: number; updated: number; linked: number; skipped: number; hidden: number; error: string | null; startedAt: string; finishedAt: string | null };
export type OsmSyncAreaDto = { id: string; city: string; province: string | null; south: number; west: number; north: number; east: number; active: boolean; lastRunAt: string | null; listedPlaces: number; lastRun: OsmImportRunDto | null };
export type PlaceClaimQueueItemDto = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  place: {
    id: string;
    name: string;
    city: string;
    category: PetFriendlyPlaceCategory;
    source: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    claimedByThisClaim: boolean;
    /** The listing's OpenStreetMap tags staff compare with the business's KYC details. */
    osmTags: Record<string, string>;
  };
  claimant: string | null;
  organization: {
    id: string;
    name: string;
    verificationStatus: string;
    phone: string | null;
    website: string | null;
    address: { addressLine: string; city: string; phone: string | null } | null;
    kycContact: { name: string; landline: string } | null;
  } | null;
  message: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** OpenStreetMap seeding (city areas, runs) and the business-claim queue. */
export const adminPlacesOsmService = {
  areas: () => apiFetch<OsmSyncAreaDto[]>(`/admin/places/osm/areas`),
  saveArea: (input: { city: string; province?: string; south: number; west: number; north: number; east: number; active: boolean }) => apiFetch<OsmSyncAreaDto[]>(`/admin/places/osm/areas`, { method: "PUT", body: input }),
  run: (areaId: string) => apiFetch<{ started: boolean }>(`/admin/places/osm/areas/${areaId}/run`, { method: "POST" }),
  claims: (status: "PENDING" | "APPROVED" = "PENDING", page = 1) => apiFetch<PaginatedDto<PlaceClaimQueueItemDto>>(`/admin/places/claims?status=${status}&page=${page}`),
  release: (placeId: string, reason: string) => apiFetch<{ placeId: string; released: boolean }>(`/admin/places/${placeId}/release-claim`, { method: "POST", body: { reason } }),
  decide: (claimId: string, approve: boolean, reason: string) => apiFetch<{ id: string; status: string }>(`/admin/places/claims/${claimId}/decision`, { method: "POST", body: { approve, reason } }),
};
