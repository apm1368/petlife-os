import type { AvailabilityResponseDto, PetSpecies, ServiceCategory, ServiceDetailDto, ServiceSearchResultDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface SearchServicesInput {
  category?: ServiceCategory;
  city?: string;
  species?: PetSpecies;
  search?: string;
  petId?: string;
}

export interface GetServiceAvailabilityInput {
  locationId?: string;
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

export const servicesService = {
  listCategories: () => apiFetch<ServiceCategory[]>("/services/categories"),

  search: (input: SearchServicesInput = {}) => apiFetch<ServiceSearchResultDto[]>(`/providers/services${toQueryString(input)}`),

  getDetail: (serviceId: string, petId?: string) => apiFetch<ServiceDetailDto>(`/provider-services/${serviceId}${toQueryString({ petId })}`),

  getAvailability: (serviceId: string, input: GetServiceAvailabilityInput) =>
    apiFetch<AvailabilityResponseDto>(`/provider-services/${serviceId}/availability${toQueryString(input)}`),
};
