import type { PetAccessFlags, PetDto, PetOverviewDto } from "@petlife/types";
import type { CreatePetInput, UpdatePetInput } from "@petlife/validation";
import { apiFetch } from "@/lib/api/client";

export interface ManagedPetAccessGrant extends PetAccessFlags {
  id: string;
  petId: string;
  userId: string;
  source: "HOUSEHOLD" | "MANUAL" | "TEMPORARY";
  startsAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: string | null;
  active: boolean;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

export const petsService = {
  getById: (id: string) => apiFetch<PetDto>(`/pets/${id}`),
  getOverview: (id: string) => apiFetch<PetOverviewDto>(`/pets/${id}/overview`),
  getMyAccess: (id: string) => apiFetch<PetAccessFlags>(`/pets/${id}/access`),
  update: (id: string, input: UpdatePetInput) => apiFetch<PetDto>(`/pets/${id}`, { method: "PATCH", body: input }),
  create: (householdId: string, input: CreatePetInput, idempotencyKey: string) =>
    apiFetch<PetDto>(`/households/${householdId}/pets`, { method: "POST", body: input, idempotencyKey }),
  createPhotoUploadUrl: (petId: string, contentType: "image/jpeg" | "image/png") =>
    apiFetch<{ uploadUrl: string; method: "PUT"; publicUrl: string; headers?: Record<string, string> }>(
      `/pets/${petId}/photo-upload-url`, { method: "POST", body: { contentType } },
    ),
  listAccessGrants: (id: string) => apiFetch<ManagedPetAccessGrant[]>(`/pets/${id}/access-grants`),
  createAccessGrant: (id: string, input: PetAccessFlags & { userId: string; startsAt?: string; expiresAt?: string; reason?: string }) => apiFetch<ManagedPetAccessGrant>(`/pets/${id}/access-grants`, { method: "POST", body: input }),
  updateAccessGrant: (id: string, grantId: string, input: Partial<PetAccessFlags> & { startsAt?: string; expiresAt?: string; reason?: string }) => apiFetch<ManagedPetAccessGrant>(`/pets/${id}/access-grants/${grantId}`, { method: "PATCH", body: input }),
  revokeAccessGrant: (id: string, grantId: string) => apiFetch<{ ok: true }>(`/pets/${id}/access-grants/${grantId}`, { method: "DELETE" }),
  markDeceased: (id: string, reason?: string) => apiFetch<PetDto>(`/pets/${id}/mark-deceased`, { method: "POST", body: { reason } }),
  transitionToMemorial: (id: string, reason?: string) => apiFetch<PetDto>(`/pets/${id}/transition-to-memorial`, { method: "POST", body: { reason } }),
};
