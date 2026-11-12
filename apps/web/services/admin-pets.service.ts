import type { AdminPet360Dto, AdminPetDirectoryItemDto, PaginatedDto, PetSpecies } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** Back-office pets (customer.view to read; pet.access.manage to revoke a non-owner grant). */
export const adminPetsService = {
  list: (input: { q?: string; species?: PetSpecies; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    if (input.q) search.set("q", input.q);
    if (input.species) search.set("species", input.species);
    search.set("page", String(input.page ?? 1));
    search.set("pageSize", String(input.pageSize ?? 20));
    return apiFetch<PaginatedDto<AdminPetDirectoryItemDto>>(`/admin/pets?${search.toString()}`);
  },
  get: (id: string) => apiFetch<AdminPet360Dto>(`/admin/pets/${id}`),
  revokeGrant: (petId: string, grantId: string, reason: string) =>
    apiFetch<{ ok: true; grantId: string }>(`/admin/pets/${petId}/grants/${grantId}/revoke`, { method: "POST", body: { reason } }),
};
