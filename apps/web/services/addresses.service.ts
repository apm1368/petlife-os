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
  /** Neighbourhood / district (محله). */
  area?: string;
  countryCode: string;
  latitude?: number | null;
  longitude?: number | null;
  instructions?: string;
  /** Iranian 10-digit postal code. */
  postalCode?: string;
  isDefault?: boolean;
}

export type UpdateAddressInput = Partial<Omit<CreateAddressInput, "householdId">>;

export const addressesService = {
  create: (input: CreateAddressInput) => apiFetch<CustomerAddressDto>("/addresses", { method: "POST", body: input }),

  list: (householdId: string) => apiFetch<CustomerAddressDto[]>(`/addresses?householdId=${householdId}`),

  update: (id: string, input: UpdateAddressInput) => apiFetch<CustomerAddressDto>(`/addresses/${id}`, { method: "PATCH", body: input }),

  /** Removes it from the book; past orders keep their own copy. */
  archive: (id: string) => apiFetch<{ archived: true; newDefaultId: string | null }>(`/addresses/${id}`, { method: "DELETE" }),
};
