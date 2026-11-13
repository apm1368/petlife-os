import type { PetFriendlyPlaceCategory } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** POST /place-suggestions (members): a new pet-friendly place for staff to review. Approval needs the map point. */
export interface PlaceSuggestionInput {
  name: string;
  category: PetFriendlyPlaceCategory;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export type PlaceSuggestionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PlaceSuggestionDto {
  id: string;
  kind: "NEW_PLACE" | "CORRECTION" | "CLOSURE_REPORT";
  placeId: string | null;
  name: string | null;
  category: PetFriendlyPlaceCategory | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: PlaceSuggestionStatus;
  reviewNote: string | null;
  createdPlaceId: string | null;
  createdAt: string;
}

export const placeSuggestionsService = {
  suggest: (input: PlaceSuggestionInput) => apiFetch<PlaceSuggestionDto>("/place-suggestions", { method: "POST", body: input }),
  mine: (signal?: AbortSignal) => apiFetch<PlaceSuggestionDto[]>("/place-suggestions/mine", { signal }),
};
