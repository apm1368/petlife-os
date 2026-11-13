import type { AdminPartnerServiceDetailDto, AdminPartnerServiceRowDto, AdminPartnerShopDetailDto, AdminPartnerShopRowDto, PaginatedDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface PartnerDirectoryInput {
  q?: string;
  province?: string;
  verification?: string;
  kind?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function query(input: PartnerDirectoryInput): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Admin Partners: service businesses and shops, each with a full read-only profile. */
export const adminPartnersService = {
  listServices: (input: PartnerDirectoryInput = {}) => apiFetch<PaginatedDto<AdminPartnerServiceRowDto>>(`/admin/partners/services${query(input)}`),
  listShops: (input: PartnerDirectoryInput = {}) => apiFetch<PaginatedDto<AdminPartnerShopRowDto>>(`/admin/partners/shops${query(input)}`),
  getService: (id: string) => apiFetch<AdminPartnerServiceDetailDto>(`/admin/partners/services/${id}`),
  getShop: (id: string) => apiFetch<AdminPartnerShopDetailDto>(`/admin/partners/shops/${id}`),
};
