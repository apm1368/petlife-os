import type { LifeTimelineEntryDto, PetMemoryDto, PetMemoryType, PetMemoryVisibility } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UploadTargetDto {
  uploadUrl: string;
  method: "PUT";
  publicUrl: string;
  headers?: Record<string, string>;
  expiresInSeconds: number;
  key: string;
}

export interface CreatePetMemoryInput {
  type: PetMemoryType;
  title: string;
  description?: string;
  occurredAt: string;
  mediaObjectKeys?: string[];
  location?: string;
  visibility?: PetMemoryVisibility;
}

export const memoriesService = {
  list: (petId: string) => apiFetch<PetMemoryDto[]>(`/pets/${petId}/memories`),
  get: (petId: string, memoryId: string) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories/${memoryId}`),
  create: (petId: string, input: CreatePetMemoryInput) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories`, { method: "POST", body: input }),
  delete: (petId: string, memoryId: string) => apiFetch<void>(`/pets/${petId}/memories/${memoryId}`, { method: "DELETE" }),
  requestMediaUpload: (petId: string, contentType: string, fileSizeBytes: number, visibility: PetMemoryVisibility) =>
    apiFetch<UploadTargetDto>(`/pets/${petId}/memories/upload-url`, { method: "POST", body: { contentType, fileSizeBytes, visibility } }),

  getLifeTimeline: (petId: string) => apiFetch<LifeTimelineEntryDto[]>(`/pets/${petId}/life-timeline`),
};
