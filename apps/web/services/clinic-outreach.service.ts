import { apiFetch } from "@/lib/api/client";
export type ClinicCampaignSegment = "APPOINTMENTS_TOMORROW" | "VACCINES_DUE" | "FOLLOW_UP_DUE";
export interface ClinicCampaignPreview { segment: ClinicCampaignSegment; recipientCount: number; count: number; excludedCount: number; alreadySentToday: boolean; exclusionReasons: {reason: string; count: number}[]; sample: {petId: string; petName: string; detail: string}[] }
export interface ClinicMoney {currency: string; amount: string}
export interface ClinicFinanceReport {
  from: string; to: string; bookings: {total: number; completed: number; cancelled: number; noShow: number; refunded: number};
  billedAmount: ClinicMoney[]; payAtClinic: ClinicMoney[]; collectedOnline: ClinicMoney[]; ledgerPosted: ClinicMoney[];
  byService: {providerServiceId: string; name: string|null; count: number; amount: string; currency: string}[];
  daily: {date: string; completed: number; amount: string}[];
}
export const clinicOutreachService = {
  preview: (segment: ClinicCampaignSegment) => apiFetch<ClinicCampaignPreview>("/provider/clinic/campaigns/preview", {method: "POST", body: {segment}}),
  send: (body: {segment: ClinicCampaignSegment; title: string; note?: string; confirm: true; expectedCount: number}) => apiFetch<{campaignId: string; segment: ClinicCampaignSegment; recipientCount: number; delivered: number}>("/provider/clinic/campaigns", {method: "POST", body}),
  finance: (from: string, to: string, signal?: AbortSignal) => apiFetch<ClinicFinanceReport>(`/provider/clinic/reports/finance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {signal}),
};
