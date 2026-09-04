import type { InsuranceApplicationDto, InsuranceEligibilityResultDto, InsuranceProductDto, InsuranceProviderDto, PaginatedDto, PetSpecies } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Public discovery/comparison directory + authenticated application/eligibility surface (Handoff 19) — mirrors animalSupportService's own public-read + toQueryString conventions. */
export const insuranceService = {
  // -- Public (no auth) -------------------------------------------------------
  listProviders: (input: { page?: number; pageSize?: number; country?: string } = {}) => apiFetch<PaginatedDto<InsuranceProviderDto>>(`/insurance/providers${toQueryString(input)}`),
  getProvider: (providerId: string) => apiFetch<InsuranceProviderDto>(`/insurance/providers/${providerId}`),
  listProducts: (input: { page?: number; pageSize?: number; country?: string; species?: PetSpecies; providerId?: string } = {}) =>
    apiFetch<PaginatedDto<InsuranceProductDto>>(`/insurance/products${toQueryString(input)}`),
  getProduct: (productId: string) => apiFetch<InsuranceProductDto>(`/insurance/products/${productId}`),
  compareProducts: (productIds: string[]) => apiFetch<InsuranceProductDto[]>(`/insurance/products/compare?productIds=${productIds.join(",")}`),

  // -- Household (authenticated) --------------------------------------------
  checkEligibility: (petId: string, productId: string) => apiFetch<InsuranceEligibilityResultDto>(`/pets/${petId}/insurance-applications/eligibility/${productId}`),
  listApplications: (petId: string) => apiFetch<InsuranceApplicationDto[]>(`/pets/${petId}/insurance-applications`),
  getApplication: (petId: string, applicationId: string) => apiFetch<InsuranceApplicationDto>(`/pets/${petId}/insurance-applications/${applicationId}`),
  createApplication: (petId: string, productId: string, notes?: string) =>
    apiFetch<InsuranceApplicationDto>(`/pets/${petId}/insurance-applications`, { method: "POST", body: { productId, notes } }),
  updateApplication: (petId: string, applicationId: string, notes: string) =>
    apiFetch<InsuranceApplicationDto>(`/pets/${petId}/insurance-applications/${applicationId}`, { method: "PATCH", body: { notes } }),
  submitApplication: (petId: string, applicationId: string) => apiFetch<InsuranceApplicationDto>(`/pets/${petId}/insurance-applications/${applicationId}/submit`, { method: "POST" }),
  cancelApplication: (petId: string, applicationId: string) => apiFetch<InsuranceApplicationDto>(`/pets/${petId}/insurance-applications/${applicationId}/cancel`, { method: "POST" }),
};
