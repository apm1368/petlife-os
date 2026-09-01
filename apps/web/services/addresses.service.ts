import type { CustomerAddressDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateAddressInput {
  householdId: string;
  label?: string;
  recipient?: string;
  phone?: string;
  addressLine: string;
  city: string;
  region?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
  instructions?: string;
}

export const addressesService = {
  create: (input: CreateAddressInput) => apiFetch<CustomerAddressDto>("/addresses", { method: "POST", body: input }),

  list: (householdId: string) => apiFetch<CustomerAddressDto[]>(`/addresses?householdId=${householdId}`),
};
