import type { PetFriendlyPlaceCategory } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type PlaceSuggestionStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PlaceSuggestionKind = "NEW_PLACE" | "CORRECTION" | "CLOSURE_REPORT";

export interface PlaceDuplicateHintDto {
  placeId: string;
  name: string;
  city: string;
  category: PetFriendlyPlaceCategory;
  status: string;
  listed: boolean;
  distanceMeters: number | null;
  sameName: boolean;
}

/** GET /admin/place-suggestions/queue — one row of the review tab (owner #6, 2026-11-13). */
export interface AdminPlaceSuggestionDto {
  id: string;
  kind: PlaceSuggestionKind;
  status: PlaceSuggestionStatus;
  name: string;
  category: PetFriendlyPlaceCategory;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  placeId: string | null;
  proposedChanges: Record<string, unknown> | null;
  reviewNote: string | null;
  createdPlaceId: string | null;
  photoCount: number;
  createdAt: string;
  member: { id: string; displayName: string | null };
  reviewedBy: string | null;
  reviewedAt: string | null;
  place: { id: string; name: string; city: string; category: PetFriendlyPlaceCategory; status: string; listed: boolean } | null;
  currentValues: Record<string, unknown> | null;
  duplicates: PlaceDuplicateHintDto[];
  similarPendingIds: string[];
  photos: { index: number; url: string | null; expiresInSeconds: number }[];
}

export interface AdminPlaceSuggestionQueueDto {
  items: AdminPlaceSuggestionDto[];
  counts: Record<PlaceSuggestionStatus, number>;
}

export const adminPlaceSuggestionsService = {
  queue: (query: { status: PlaceSuggestionStatus; kind?: PlaceSuggestionKind }) => {
    const params = new URLSearchParams({ status: query.status });
    if (query.kind) params.set("kind", query.kind);
    return apiFetch<AdminPlaceSuggestionQueueDto>(`/admin/place-suggestions/queue?${params}`);
  },
  approve: (id: string, body: { note?: string; latitude?: number; longitude?: number }) =>
    apiFetch<{ id: string; status: PlaceSuggestionStatus; createdPlaceId: string | null }>(`/admin/place-suggestions/${id}/approve`, { method: "POST", body }),
  reject: (id: string, note: string) => apiFetch<{ id: string; status: PlaceSuggestionStatus }>(`/admin/place-suggestions/${id}/reject`, { method: "POST", body: { note } }),
};
