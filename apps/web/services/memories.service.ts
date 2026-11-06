import type { LifeTimelineEntryDto, PetMemoryDto, PetMemoryType, PetMemoryVisibility } from "@petlife/types";
import { API_BASE_URL, apiFetch } from "@/lib/api/client";

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
  title?: string;
  description?: string;
  occurredAt: string;
  mediaObjectKeys?: string[];
  location?: string;
  visibility?: PetMemoryVisibility;
  tags?: string[];
}

export interface UpdatePetMemoryInput {
  type?: PetMemoryType;
  title?: string;
  description?: string;
  occurredAt?: string;
  mediaObjectKeys?: string[];
  location?: string;
  tags?: string[];
}

export interface ListPetMemoriesFilter {
  search?: string;
  tag?: string;
  year?: number;
  includeArchived?: boolean;
}

export interface MemoryMediaDownloadDto {
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface PetMemorialStatusDto {
  id: string;
  displayName: string;
  status: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "WITHDRAWN";
  consentedAt: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  withdrawnAt: string | null;
}
export interface PublicPetMemorialDto { id: string; name: string; imageUrl: string }

function buildMemoriesQuery(filter?: ListPetMemoriesFilter): string {
  if (!filter) return "";
  const params = new URLSearchParams();
  if (filter.search) params.set("search", filter.search);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.year) params.set("year", String(filter.year));
  if (filter.includeArchived) params.set("includeArchived", "true");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const memoriesService = {
  list: (petId: string, filter?: ListPetMemoriesFilter) => apiFetch<PetMemoryDto[]>(`/pets/${petId}/memories${buildMemoriesQuery(filter)}`),
  get: (petId: string, memoryId: string) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories/${memoryId}`),
  create: (petId: string, input: CreatePetMemoryInput) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories`, { method: "POST", body: input }),
  update: (petId: string, memoryId: string, input: UpdatePetMemoryInput) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories/${memoryId}`, { method: "PATCH", body: input }),
  /** Archives (soft-deletes) — never a hard delete. See PetMemoryService.archive. */
  delete: (petId: string, memoryId: string) => apiFetch<void>(`/pets/${petId}/memories/${memoryId}`, { method: "DELETE" }),
  restore: (petId: string, memoryId: string) => apiFetch<PetMemoryDto>(`/pets/${petId}/memories/${memoryId}/restore`, { method: "POST" }),
  requestMediaUpload: (petId: string, contentType: string, fileSizeBytes: number, visibility: PetMemoryVisibility) =>
    apiFetch<UploadTargetDto>(`/pets/${petId}/memories/upload-url`, { method: "POST", body: { contentType, fileSizeBytes, visibility } }),
  /** PRIVATE memory media has no plain URL in the DTO (mediaUrls is only ever populated for PUBLIC memories) — a signed download must be minted per-item, per-request. */
  getMediaDownload: (petId: string, memoryId: string, index: number) => apiFetch<MemoryMediaDownloadDto>(`/pets/${petId}/memories/${memoryId}/media/${index}/download`),

  getLifeTimeline: (petId: string) => apiFetch<LifeTimelineEntryDto[]>(`/pets/${petId}/life-timeline`),
  getMemorial: (petId: string) => apiFetch<PetMemorialStatusDto | null>(`/pets/${petId}/memories/memorial`),
  submitMemorial: (petId: string, input: { displayName: string; imageMemoryId: string; consent: true }) => apiFetch<PetMemorialStatusDto>(`/pets/${petId}/memories/memorial`, { method: "POST", body: input }),
  withdrawMemorial: (petId: string) => apiFetch<{ withdrawn: boolean }>(`/pets/${petId}/memories/memorial/withdraw`, { method: "POST" }),
  listPublicMemorials: async () => (await apiFetch<PublicPetMemorialDto[]>("/public/pet-memorials")).map((item) => ({
    ...item,
    imageUrl: new URL(item.imageUrl, API_BASE_URL).toString(),
  })),
};
