import type { PaginatedDto, PartnerSupportCategory, SupportCasePartnerDetailDto, SupportCasePartnerSummaryDto, SupportMessageDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreatePartnerSupportCaseInput {
  subject: string;
  description: string;
  category: PartnerSupportCategory;
}

/** One API for both panels: the provider panel has one active business, a shop is named in the path. */
function partnerSupportClient(base: string) {
  return {
    list: (pageSize = 50) => apiFetch<PaginatedDto<SupportCasePartnerSummaryDto>>(`${base}?pageSize=${pageSize}`),
    create: (input: CreatePartnerSupportCaseInput) => apiFetch<SupportCasePartnerSummaryDto>(base, { method: "POST", body: input }),
    get: (id: string) => apiFetch<SupportCasePartnerDetailDto>(`${base}/${id}`),
    postMessage: (id: string, body: string) => apiFetch<SupportMessageDto>(`${base}/${id}/messages`, { method: "POST", body: { body } }),
    reopen: (id: string) => apiFetch<SupportCasePartnerSummaryDto>(`${base}/${id}/reopen`, { method: "POST" }),
  };
}

export type PartnerSupportClient = ReturnType<typeof partnerSupportClient>;

export const partnerSupportService = {
  provider: (): PartnerSupportClient => partnerSupportClient("/provider/support/cases"),
  seller: (sellerId: string): PartnerSupportClient => partnerSupportClient(`/seller-organizations/${sellerId}/support/cases`),
};
