import type {
  AdminSponsoredCampaignDetailDto,
  AdminSponsoredCampaignDto,
  AdminSponsoredRateDto,
  PaginatedDto,
  SponsoredCampaignDto,
  SponsoredCampaignInput,
  SponsoredCampaignStatusValue,
  SponsoredOverviewDto,
  SponsoredPlacementValue,
  SponsoredSlotDto,
  SponsoredTargetDto,
} from "@petlife/types";
import { API_BASE_URL, apiFetch } from "@/lib/api/client";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface SponsoredContext {
  category?: string;
  species?: string;
  serviceCategory?: string;
  city?: string;
}

/** Sponsored listings: public slots and click links, a partner's campaigns, and the staff side. */
export const sponsoredService = {
  slots: (placement: SponsoredPlacementValue, context: SponsoredContext = {}, signal?: AbortSignal) =>
    apiFetch<SponsoredSlotDto[]>(`/sponsored/slots${qs({ placement, ...context })}`, { signal }),
  /** The logged click-out (the API redirects to the listing); never link the listing itself from a sponsored card. */
  clickUrl: (slot: Pick<SponsoredSlotDto, "clickPath">, locale: string) => `${API_BASE_URL}${slot.clickPath}?l=${encodeURIComponent(locale)}`,

  overview: (accountId: string) => apiFetch<SponsoredOverviewDto>(`/wallet/accounts/${encodeURIComponent(accountId)}/sponsored`),
  targets: (accountId: string, q?: string) => apiFetch<SponsoredTargetDto[]>(`/wallet/accounts/${encodeURIComponent(accountId)}/sponsored/targets${qs({ q })}`),
  create: (accountId: string, input: SponsoredCampaignInput) => apiFetch<SponsoredCampaignDto>(`/wallet/accounts/${encodeURIComponent(accountId)}/sponsored`, { method: "POST", body: input }),
  update: (accountId: string, id: string, input: { dailyBudgetIrr: number; maxCpcIrr: number }) =>
    apiFetch<SponsoredCampaignDto>(`/wallet/accounts/${encodeURIComponent(accountId)}/sponsored/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
  setStatus: (accountId: string, id: string, action: "pause" | "resume" | "stop") =>
    apiFetch<SponsoredCampaignDto>(`/wallet/accounts/${encodeURIComponent(accountId)}/sponsored/${encodeURIComponent(id)}/${action}`, { method: "POST", body: {} }),

  admin: {
    campaigns: (query: { status?: SponsoredCampaignStatusValue; placement?: SponsoredPlacementValue; q?: string; page?: number } = {}) =>
      apiFetch<PaginatedDto<AdminSponsoredCampaignDto>>(`/admin/sponsored/campaigns${qs({ ...query, page: query.page ?? 1, pageSize: 20 })}`),
    campaign: (id: string) => apiFetch<AdminSponsoredCampaignDetailDto>(`/admin/sponsored/campaigns/${encodeURIComponent(id)}`),
    moderate: (id: string, action: "hold" | "release" | "stop", reason?: string) =>
      apiFetch<AdminSponsoredCampaignDto>(`/admin/sponsored/campaigns/${encodeURIComponent(id)}/${action}`, { method: "POST", body: action === "release" ? {} : { reason } }),
    refund: (clickIds: string[], reason: string) => apiFetch<{ refunded: number; amountIrr: number }>("/admin/sponsored/clicks/refund", { method: "POST", body: { clickIds, reason } }),
    rate: () => apiFetch<AdminSponsoredRateDto>("/admin/sponsored/rate"),
    setRate: (input: { rateIrr: number; effectiveFrom?: string; reason: string }) => apiFetch<AdminSponsoredRateDto>("/admin/sponsored/rate", { method: "POST", body: input }),
  },
};
