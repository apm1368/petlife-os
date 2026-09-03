import type { PaginatedDto, SupportCaseCategory, SupportCaseUserDetailDto, SupportCaseUserSummaryDto, SupportMessageDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateMySupportCaseInput {
  subject: string;
  description: string;
  category: SupportCaseCategory;
  householdId?: string;
  petId?: string;
  relatedEntityType?: "ORDER" | "BOOKING";
  relatedEntityId?: string;
}

export const supportService = {
  list: (input: { page?: number; pageSize?: number } = {}) => {
    const search = new URLSearchParams();
    if (input.page) search.set("page", String(input.page));
    if (input.pageSize) search.set("pageSize", String(input.pageSize));
    const query = search.toString();
    return apiFetch<PaginatedDto<SupportCaseUserSummaryDto>>(`/support/cases${query ? `?${query}` : ""}`);
  },

  create: (input: CreateMySupportCaseInput) => apiFetch<SupportCaseUserSummaryDto>("/support/cases", { method: "POST", body: input }),

  getById: (id: string) => apiFetch<SupportCaseUserDetailDto>(`/support/cases/${id}`),

  postMessage: (id: string, body: string) => apiFetch<SupportMessageDto>(`/support/cases/${id}/messages`, { method: "POST", body: { body } }),

  reopen: (id: string) => apiFetch<SupportCaseUserSummaryDto>(`/support/cases/${id}/reopen`, { method: "POST" }),
};
