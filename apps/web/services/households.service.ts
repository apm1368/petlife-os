import type { HouseholdDto, PetDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateHouseholdInput {
  name?: string;
  city?: string;
  region?: string;
  countryCode?: string;
}

export const householdsService = {
  create: (input: CreateHouseholdInput) => apiFetch<HouseholdDto>("/households", { method: "POST", body: input }),

  listMine: () => apiFetch<HouseholdDto[]>("/households"),

  getById: (id: string) => apiFetch<HouseholdDto>(`/households/${id}`),

  update: (id: string, input: Partial<CreateHouseholdInput>) =>
    apiFetch<HouseholdDto>(`/households/${id}`, { method: "PATCH", body: input }),

  listPets: (householdId: string) => apiFetch<PetDto[]>(`/households/${householdId}/pets`),

  getActivePet: (householdId: string) => apiFetch<PetDto | null>(`/households/${householdId}/active-pet`),

  setActivePet: (householdId: string, petId: string) =>
    apiFetch<{ petId: string }>(`/households/${householdId}/active-pet`, { method: "PUT", body: { petId } }),
};
