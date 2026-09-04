import type { PetObservationDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateObservationInput {
  category: string;
  description: string;
  observedAt: string;
  mediaKey?: string;
  mediaType?: string;
  mediaMimeType?: string;
}

export const petObservationService = {
  list: (petId: string) => apiFetch<PetObservationDto[]>(`/pets/${petId}/observations`),
  requestMediaUpload: (petId: string, input: { contentType: string; fileSizeBytes: number }) =>
    apiFetch<{ uploadUrl: string; method: "PUT"; headers?: Record<string, string>; key: string }>(`/pets/${petId}/observations/media-upload-url`, { method: "POST", body: input }),
  create: (petId: string, input: CreateObservationInput) => apiFetch<PetObservationDto>(`/pets/${petId}/observations`, { method: "POST", body: input }),
};
