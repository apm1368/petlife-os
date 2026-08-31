import type { PetDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";
import type { CreatePetInput, UpdatePetInput } from "@petlife/validation";

export const petsService = {
  getById: (id: string) => apiFetch<PetDto>(`/pets/${id}`),

  update: (id: string, input: UpdatePetInput) => apiFetch<PetDto>(`/pets/${id}`, { method: "PATCH", body: input }),

  create: (householdId: string, input: CreatePetInput, idempotencyKey: string) =>
    apiFetch<PetDto>(`/households/${householdId}/pets`, { method: "POST", body: input, idempotencyKey }),

  createPhotoUploadUrl: (petId: string, contentType: "image/jpeg" | "image/png") =>
    apiFetch<{ uploadUrl: string; method: "PUT"; publicUrl: string; headers?: Record<string, string> }>(
      `/pets/${petId}/photo-upload-url`,
      { method: "POST", body: { contentType } },
    ),
};
