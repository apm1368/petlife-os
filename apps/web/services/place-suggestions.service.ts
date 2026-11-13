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
  /** Keys from photoUploadUrl, already PUT (at most 3; owner #6). */
  photoObjectKeys?: string[];
}

/** A private upload slot for one suggestion photo (JPEG/PNG/WebP, at most 10 MB). PUT the bytes, then send the key. */
export interface PlaceSuggestionPhotoUploadDto {
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  expiresInSeconds: number;
  key: string;
  maxBytes: number;
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
  /** How many photos came with it (the keys are never returned). */
  photoCount?: number;
  createdAt: string;
}

export const placeSuggestionsService = {
  suggest: (input: PlaceSuggestionInput) => apiFetch<PlaceSuggestionDto>("/place-suggestions", { method: "POST", body: input }),
  mine: (signal?: AbortSignal) => apiFetch<PlaceSuggestionDto[]>("/place-suggestions/mine", { signal }),
  photoUploadUrl: (input: { contentType: string; fileSizeBytes: number }) =>
    apiFetch<PlaceSuggestionPhotoUploadDto>("/place-suggestions/photo-upload-url", { method: "POST", body: input }),
};
