import type { LostPetIncidentDto, LostPetIncidentPublicDto, LostPetSightingDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UploadTargetDto {
  uploadUrl: string;
  method: "PUT";
  publicUrl: string;
  headers?: Record<string, string>;
  expiresInSeconds: number;
  key: string;
}

export interface CreateLostPetIncidentInput {
  description: string;
  lastKnownLocation?: string;
  lastKnownLatitude?: number;
  lastKnownLongitude?: number;
  lastSeenAt?: string;
  publicNotes?: string;
  privateNotes?: string;
  primaryPhotoObjectKey?: string;
  contactPreference?: "IN_APP_MESSAGE" | "MASKED_CONTACT" | "PUBLIC_CONTACT";
  publicContactMode?: string;
}

export interface SubmitSightingInput {
  seenAt: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  photoObjectKey?: string;
  reporterContactToken?: string;
}

export const lostPetService = {
  // -- Household (authenticated) --------------------------------------------
  list: (petId: string) => apiFetch<LostPetIncidentDto[]>(`/pets/${petId}/lost-incidents`),
  get: (petId: string, incidentId: string) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents/${incidentId}`),
  open: (petId: string, input: CreateLostPetIncidentInput) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents`, { method: "POST", body: input }),
  requestPhotoUpload: (petId: string, contentType: string, fileSizeBytes: number) =>
    apiFetch<UploadTargetDto>(`/pets/${petId}/lost-incidents/upload-url`, { method: "POST", body: { contentType, fileSizeBytes } }),
  markSearching: (petId: string, incidentId: string) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents/${incidentId}/mark-searching`, { method: "POST" }),
  markFound: (petId: string, incidentId: string) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents/${incidentId}/mark-found`, { method: "POST" }),
  reunite: (petId: string, incidentId: string) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents/${incidentId}/reunite`, { method: "POST" }),
  close: (petId: string, incidentId: string, reason?: string) => apiFetch<LostPetIncidentDto>(`/pets/${petId}/lost-incidents/${incidentId}/close`, { method: "POST", body: { reason } }),
  shareToCommunity: (petId: string, incidentId: string) => apiFetch(`/pets/${petId}/lost-incidents/${incidentId}/share-to-community`, { method: "POST" }),
  listSightings: (petId: string, incidentId: string) => apiFetch<LostPetSightingDto[]>(`/pets/${petId}/lost-incidents/${incidentId}/sightings`),
  reviewSighting: (petId: string, incidentId: string, sightingId: string, decision: "ACCEPTED" | "REJECTED") =>
    apiFetch<LostPetSightingDto>(`/pets/${petId}/lost-incidents/${incidentId}/sightings/${sightingId}/review`, { method: "POST", body: { decision } }),

  // -- Public (no auth) -------------------------------------------------------
  listPublic: () => apiFetch<LostPetIncidentPublicDto[]>(`/lost-pets`),
  getPublic: (incidentId: string) => apiFetch<LostPetIncidentPublicDto>(`/lost-pets/${incidentId}`),
  requestSightingPhotoUpload: (incidentId: string, contentType: string, fileSizeBytes: number) =>
    apiFetch<UploadTargetDto>(`/lost-pets/${incidentId}/sightings/upload-url`, { method: "POST", body: { contentType, fileSizeBytes } }),
  submitSighting: (incidentId: string, input: SubmitSightingInput) => apiFetch<LostPetSightingDto>(`/lost-pets/${incidentId}/sightings`, { method: "POST", body: input }),
};
