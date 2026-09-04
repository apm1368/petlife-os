import type { AnimalSupportOrganizationDto, DonationHistoryItemDto, DonationStatus, PaginatedDto, PublicDonationEntryDto, RescueCaseDto, RescueCaseStatus, SupportCampaignDto, SupportCampaignUpdateDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface DonationOutcome {
  donationIntentId: string;
  status: DonationStatus;
}

/** Public directory + authenticated donate/history surface (Handoff 18) — mirrors blogService's own public-read shape/conventions. */
export const animalSupportService = {
  listOrganizations: (input: { page?: number; pageSize?: number; q?: string } = {}) => apiFetch<PaginatedDto<AnimalSupportOrganizationDto>>(`/animal-support/organizations${toQueryString(input)}`),
  getOrganization: (organizationId: string) => apiFetch<AnimalSupportOrganizationDto>(`/animal-support/organizations/${organizationId}`),
  listRescueCases: (input: { page?: number; pageSize?: number; organizationId?: string; status?: RescueCaseStatus } = {}) =>
    apiFetch<PaginatedDto<RescueCaseDto>>(`/animal-support/rescue-cases${toQueryString(input)}`),
  getRescueCase: (rescueCaseId: string) => apiFetch<RescueCaseDto>(`/animal-support/rescue-cases/${rescueCaseId}`),
  listCampaigns: (input: { page?: number; pageSize?: number; organizationId?: string; rescueCaseId?: string } = {}) =>
    apiFetch<PaginatedDto<SupportCampaignDto>>(`/animal-support/campaigns${toQueryString(input)}`),
  getCampaign: (campaignId: string) => apiFetch<SupportCampaignDto>(`/animal-support/campaigns/${campaignId}`),
  listCampaignUpdates: (campaignId: string) => apiFetch<SupportCampaignUpdateDto[]>(`/animal-support/campaigns/${campaignId}/updates`),
  listCampaignDonors: (campaignId: string, limit = 50) => apiFetch<PublicDonationEntryDto[]>(`/animal-support/campaigns/${campaignId}/donors${toQueryString({ limit })}`),

  donate: (campaignId: string, input: { amountIrr: number; showDonorPublicly?: boolean; idempotencyKey?: string }) =>
    apiFetch<DonationOutcome>(`/animal-support/campaigns/${campaignId}/donate`, { method: "POST", body: input }),
  listMyDonations: (input: { page?: number; pageSize?: number } = {}) => apiFetch<PaginatedDto<DonationHistoryItemDto>>(`/me/donations${toQueryString(input)}`),
};
