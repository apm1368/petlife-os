import type { AvailabilityResponseDto, PetSpecies, ProviderProfileDto, ProviderServiceType, ProviderSummaryDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface SearchVetsInput {
  city?: string;
  species?: PetSpecies;
  serviceType?: ProviderServiceType;
  search?: string;
}

export interface GetAvailabilityInput {
  locationId: string;
  serviceId: string;
  from: string;
  to: string;
  petId?: string;
  providerUserId?: string;
}

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const providersService = {
  searchVets: (input: SearchVetsInput = {}) => apiFetch<ProviderSummaryDto[]>(`/providers/vets${toQueryString(input)}`),

  getProfile: (providerId: string) => apiFetch<ProviderProfileDto>(`/providers/vets/${providerId}`),

  getAvailability: (providerId: string, input: GetAvailabilityInput) =>
    apiFetch<AvailabilityResponseDto>(`/providers/vets/${providerId}/availability${toQueryString(input)}`),
};
