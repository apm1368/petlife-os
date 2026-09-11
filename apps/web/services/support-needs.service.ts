import type {
  HelpOfferDto,
  HelpOfferStatus,
  PaginatedDto,
  SupportNeedCategory,
  SupportNeedContactMode,
  SupportNeedListingDto,
  SupportNeedStatus,
  SupportNeedUrgency,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface SupportNeedFilters extends Record<string, string | number | boolean | undefined> {
  page?: number;
  pageSize?: number;
  category?: SupportNeedCategory;
  urgency?: SupportNeedUrgency;
  province?: string;
  city?: string;
  search?: string;
  organizationId?: string;
}

export interface CreateSupportNeedInput {
  title: string;
  description: string;
  category: SupportNeedCategory;
  urgency?: SupportNeedUrgency;
  province: string;
  city: string;
  neighborhood?: string;
  imageObjectKeys?: string[];
  neededQuantity?: number;
  quantityUnit?: string;
  organizationId?: string;
  campaignId?: string;
  contactMode?: SupportNeedContactMode;
  animalType?: string;
}

export type UpdateSupportNeedInput = Partial<Omit<CreateSupportNeedInput, "organizationId" | "campaignId" | "contactMode">>;

export interface SupportNeedLocationDto {
  province: string;
  city: string;
}

export interface SupportNeedOfferSummaryDto {
  listingId: string;
  neededQuantity: number | null;
  fulfilledQuantity: number;
  pendingOffers: number;
  acceptedOffers: number;
  completedOffers: number;
}

export interface UploadTargetDto {
  uploadUrl: string;
  method: "PUT";
  publicUrl: string;
  headers?: Record<string, string>;
  expiresInSeconds: number;
  key: string;
}

/**
 * The Animal Support classifieds board (Handoff 22). Browsing is anonymous;
 * everything that writes requires a session, which `apiFetch` surfaces as a
 * typed ApiError the calling view turns into a sign-in prompt.
 */
export const supportNeedsService = {
  list: (filters: SupportNeedFilters = {}) => apiFetch<PaginatedDto<SupportNeedListingDto>>(`/animal-support/needs${toQueryString(filters)}`),
  listLocations: () => apiFetch<SupportNeedLocationDto[]>("/animal-support/needs/locations"),
  get: (listingId: string) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}`),
  getSummary: (listingId: string) => apiFetch<SupportNeedOfferSummaryDto>(`/animal-support/needs/${listingId}/summary`),

  create: (input: CreateSupportNeedInput) => apiFetch<SupportNeedListingDto>("/animal-support/needs", { method: "POST", body: input }),
  update: (listingId: string, input: UpdateSupportNeedInput) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}`, { method: "PATCH", body: input }),
  submitForReview: (listingId: string) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}/submit`, { method: "POST" }),
  markFulfilled: (listingId: string) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}/fulfill`, { method: "POST" }),
  close: (listingId: string) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}/close`, { method: "POST" }),

  listMine: (input: { page?: number; pageSize?: number; status?: SupportNeedStatus } = {}) =>
    apiFetch<PaginatedDto<SupportNeedListingDto>>(`/animal-support/needs/mine${toQueryString(input)}`),
  getMine: (listingId: string) => apiFetch<SupportNeedListingDto>(`/animal-support/needs/${listingId}/manage`),

  requestImageUpload: (contentType: string, fileSizeBytes: number) =>
    apiFetch<UploadTargetDto>("/animal-support/needs/upload-url", { method: "POST", body: { contentType, fileSizeBytes } }),

  offerHelp: (listingId: string, input: { message: string; helpType: SupportNeedCategory; quantity?: number }) =>
    apiFetch<HelpOfferDto>(`/animal-support/needs/${listingId}/offers`, { method: "POST", body: input }),
  listOffers: (listingId: string) => apiFetch<HelpOfferDto[]>(`/animal-support/needs/${listingId}/offers`),
  listMyOffers: () => apiFetch<HelpOfferDto[]>("/animal-support/needs/mine/offers"),
  respondToOffer: (listingId: string, offerId: string, input: { status: HelpOfferStatus; fulfilledQuantity?: number }) =>
    apiFetch<HelpOfferDto>(`/animal-support/needs/${listingId}/offers/${offerId}`, { method: "PATCH", body: input }),
};
