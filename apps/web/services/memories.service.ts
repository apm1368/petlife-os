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

export interface MemoryMediaDownloadDto {
  downloadUrl: string;
  expiresInSeconds: number;
}

export const memoriesService = {
  list: (petId: string) => apiFetch<PetMemoryDto[]>(`/pets/${petId}/memories`),
  get: (petId: string, memoryId: string) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories/${memoryId}`),
  create: (petId: string, input: CreatePetMemoryInput) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories`, { method: "POST", body: input }),
  delete: (petId: string, memoryId: string) => apiFetch<void>(`/pets/${petId}/memories/${memoryId}`, { method: "DELETE" }),
  requestMediaUpload: (petId: string, contentType: string, fileSizeBytes: number, visibility: PetMemoryVisibility) =>
    apiFetch<UploadTargetDto>(`/pets/${petId}/memories/upload-url`, { method: "POST", body: { contentType, fileSizeBytes, visibility } }),
  /** PRIVATE memory media has no plain URL in the DTO (mediaUrls is only ever populated for PUBLIC memories) — a signed download must be minted per-item, per-request. */
  getMediaDownload: (petId: string, memoryId: string, index: number) => apiFetch<MemoryMediaDownloadDto>(`/pets/${petId}/memories/${memoryId}/media/${index}/download`),

  getLifeTimeline: (petId: string) => apiFetch<LifeTimelineEntryDto[]>(`/pets/${petId}/life-timeline`),
};
