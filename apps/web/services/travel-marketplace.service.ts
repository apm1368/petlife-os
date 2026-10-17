import type {
  AdminTravelAnalyticsDto,
  InsuranceApplicationStatus,
  InsurerApplicationDetailDto,
  InsurerApplicationRowDto,
  PaginatedDto,
  TravelAvailabilityDayDto,
  TravelBookingDto,
  TravelBookingStatus,
  TravelDestinationDto,
  TravelListingDetailDto,
  TravelListingDto,
  TravelListingStatus,
  TravelListingType,
  TravelProviderCalendarDto,
  TravelProviderFinanceDto,
  TravelQuoteDto,
  TravelRequirementRuleDto,
  TravelRequirementType,
  TravelReviewDto,
  TravelSearchResultDto,
  TravelSearchResultItemDto,
  TripHubDto,
  TripListItemDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type TravelSort = "RECOMMENDED" | "PRICE_ASC" | "PRICE_DESC" | "RATING" | "DISTANCE" | "BEST_PET_MATCH";

export interface TravelSearchParams {
  city?: string;
  province?: string;
  q?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  species?: "DOG" | "CAT" | "OTHER";
  petCount?: number;
  petWeightKg?: number;
  petIds?: string[];
  types?: TravelListingType[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  verified?: boolean;
  noPetFee?: boolean;
  freeCancellation?: boolean;
  instantBooking?: boolean;
  amenities?: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: TravelSort;
  page?: number;
  pageSize?: number;
}

/** Serialises only set values; arrays become comma lists (the API accepts both). */
export function toQuery(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) q.set(k, v.join(","));
    } else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface HoldInput {
  listingId: string;
  unitId: string;
  ratePlanId?: string;
  checkIn: string;
  checkOut: string;
  petIds?: string[];
  guests?: number;
}

export interface ProviderTravelReviewRow {
  id: string;
  listingId: string;
  listingTitle: string;
  overall: number;
  petFriendliness: number | null;
  cleanliness: number | null;
  location: number | null;
  body: string | null;
  status: "PUBLISHED" | "HIDDEN";
  providerResponse: string | null;
  createdAt: string;
}

export interface RatePlanInput {
  name: string;
  priceModifierPercent?: number;
  cancellationType?: "FREE_UNTIL" | "PARTIAL" | "NON_REFUNDABLE";
  freeCancellationDays?: number;
  lateRefundPercent?: number;
  paymentTiming?: "PAY_NOW" | "DEPOSIT" | "PAY_AT_PROPERTY";
  depositPercent?: number;
  includesBreakfast?: boolean;
  includedItems?: string[];
  minNights?: number;
  isActive?: boolean;
}

export interface ListingInput {
  type?: TravelListingType;
  title?: string;
  description?: string;
  country?: string;
  province?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  amenities?: string[];
  bookingMode?: "INSTANT_BOOKING" | "REQUEST_TO_BOOK";
  cancellationPolicy?: string;
  checkInFrom?: string;
  checkOutUntil?: string;
  houseRules?: string;
}

export interface UnitInput {
  name?: string;
  description?: string;
  quantity?: number;
  maxOccupancy?: number;
  basePriceIrr?: number;
  isActive?: boolean;
  bedInfo?: string;
  sizeSqm?: number;
  amenities?: string[];
  maxPets?: number;
  petNotes?: string;
}

export interface PetPolicyInput {
  dogsAllowed?: boolean;
  catsAllowed?: boolean;
  otherAllowed?: boolean;
  maxPets?: number;
  maxWeightKg?: number;
  minWeightKg?: number;
  breedRestrictions?: string[];
  vaccinationRequired?: boolean;
  healthCertificateRequired?: boolean;
  carrierRequired?: boolean;
  leashRequired?: boolean;
  petFeeIrr?: number;
  depositIrr?: number;
  restrictedAreas?: string;
  notes?: string;
}

/** Consumer travel: discovery, booking lifecycle, favorites and trips. */
export const travelMarketService = {
  destinations: () => apiFetch<TravelDestinationDto[]>("/travel/destinations"),
  search: (p: TravelSearchParams) => apiFetch<TravelSearchResultDto>(`/travel/listings${toQuery(p)}`),
  compare: (ids: string[], checkIn?: string, checkOut?: string) => apiFetch<TravelSearchResultItemDto[]>(`/travel/compare${toQuery({ ids, checkIn, checkOut })}`),
  detail: (id: string) => apiFetch<TravelListingDetailDto>(`/travel/listings/${id}`),
  reviews: (id: string, page = 1) => apiFetch<PaginatedDto<TravelReviewDto>>(`/travel/listings/${id}/reviews?page=${page}`),
  unitCalendar: (id: string, unitId: string, from: string, to: string) => apiFetch<TravelAvailabilityDayDto[]>(`/travel/listings/${id}/units/${unitId}/calendar${toQuery({ from, to })}`),
  quote: (id: string, p: { unitId: string; ratePlanId?: string; checkIn: string; checkOut: string; petIds?: string[] }) => apiFetch<TravelQuoteDto>(`/travel/listings/${id}/quote${toQuery(p)}`),

  hold: (input: HoldInput) => apiFetch<TravelBookingDto>("/travel/bookings/hold", { method: "POST", body: input }),
  submit: (id: string, input: { travelerNote?: string; tripId?: string; acknowledgeMissingInfo?: boolean }) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/submit`, { method: "POST", body: input }),
  pay: (id: string, idempotencyKey: string) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/pay`, { method: "POST", body: {}, idempotencyKey }),
  listBookings: (p: { scope?: "upcoming" | "past"; status?: string; page?: number } = {}) => apiFetch<PaginatedDto<TravelBookingDto>>(`/travel/bookings${toQuery(p)}`),
  getBooking: (id: string) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}`),
  cancel: (id: string, reason?: string) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/cancel`, { method: "POST", body: { reason } }),
  modify: (id: string, input: { checkIn: string; checkOut: string }) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/modify`, { method: "POST", body: input }),
  review: (id: string, input: { overall: number; petFriendliness?: number; cleanliness?: number; location?: number; body?: string }) => apiFetch<TravelReviewDto>(`/travel/bookings/${id}/review`, { method: "POST", body: input }),
  shareDocument: (id: string, input: { medicalDocumentId: string; purpose: string }) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/documents`, { method: "POST", body: input }),
  revokeDocument: (id: string, shareId: string) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/documents/${shareId}`, { method: "DELETE" }),
  attachTrip: (id: string, tripId: string) => apiFetch<TravelBookingDto>(`/travel/bookings/${id}/attach-trip`, { method: "POST", body: { tripId } }),

  favorite: (id: string) => apiFetch<{ listingId: string; favorited: boolean }>(`/travel/listings/${id}/favorite`, { method: "PUT" }),
  unfavorite: (id: string) => apiFetch<{ listingId: string; favorited: boolean }>(`/travel/listings/${id}/favorite`, { method: "DELETE" }),
  favorites: () => apiFetch<TravelSearchResultItemDto[]>("/travel/favorites"),

  trips: (scope?: "upcoming" | "past") => apiFetch<TripListItemDto[]>(`/travel/trips${toQuery({ scope })}`),
  hub: (tripId: string) => apiFetch<TripHubDto>(`/travel/trips/${tripId}/hub`),
  addRules: (tripId: string, ruleIds: string[]) => apiFetch<TripHubDto>(`/travel/trips/${tripId}/requirements/from-rules`, { method: "POST", body: { ruleIds } }),
};

/** Travel partner portal (provider OS). */
export const travelProviderService = {
  listings: () => apiFetch<PaginatedDto<TravelListingDto>>("/provider/travel/listings?pageSize=50"),
  listing: (id: string) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}`),
  create: (input: ListingInput) => apiFetch<TravelListingDto>("/provider/travel/listings", { method: "POST", body: input }),
  update: (id: string, input: ListingInput) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}`, { method: "PATCH", body: input }),
  submit: (id: string) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/submit`, { method: "POST" }),
  withdraw: (id: string) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/withdraw`, { method: "POST" }),
  petPolicy: (id: string, input: PetPolicyInput) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/pet-policy`, { method: "PUT", body: input }),
  addMedia: (id: string, input: { url: string; alt?: string; unitId?: string }) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/media`, { method: "POST", body: input }),
  removeMedia: (id: string, mediaId: string) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/media/${mediaId}`, { method: "DELETE" }),
  createUnit: (id: string, input: UnitInput) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/units`, { method: "POST", body: input }),
  updateUnit: (id: string, unitId: string, input: UnitInput) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/units/${unitId}`, { method: "PATCH", body: input }),
  createRatePlan: (id: string, unitId: string, input: RatePlanInput) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/units/${unitId}/rate-plans`, { method: "POST", body: input }),
  updateRatePlan: (id: string, unitId: string, planId: string, input: Partial<RatePlanInput>) => apiFetch<TravelListingDto>(`/provider/travel/listings/${id}/units/${unitId}/rate-plans/${planId}`, { method: "PATCH", body: input }),
  setAvailability: (id: string, unitId: string, input: { fromDate: string; toDate: string; isBlocked?: boolean; priceIrr?: number }) => apiFetch<{ updatedDays: number }>(`/provider/travel/listings/${id}/units/${unitId}/availability`, { method: "PUT", body: input }),
  calendar: (id: string, from: string, to: string) => apiFetch<TravelProviderCalendarDto[]>(`/provider/travel/listings/${id}/calendar${toQuery({ from, to })}`),
  bookings: (p: { status?: string; page?: number } = {}) => apiFetch<PaginatedDto<TravelBookingDto>>(`/provider/travel/bookings${toQuery(p)}`),
  booking: (id: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}`),
  accept: (id: string, note?: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/accept`, { method: "POST", body: { note } }),
  reject: (id: string, reason: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/reject`, { method: "POST", body: { reason } }),
  checkIn: (id: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/check-in`, { method: "POST" }),
  complete: (id: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/complete`, { method: "POST" }),
  noShow: (id: string, note?: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/no-show`, { method: "POST", body: { note } }),
  cancel: (id: string, reason: string) => apiFetch<TravelBookingDto>(`/provider/travel/bookings/${id}/cancel`, { method: "POST", body: { reason } }),
  documentUrl: (id: string, shareId: string) => apiFetch<{ downloadUrl: string; expiresInSeconds: number }>(`/provider/travel/bookings/${id}/documents/${shareId}/url`),
  reviews: (page = 1) => apiFetch<PaginatedDto<ProviderTravelReviewRow>>(`/provider/travel/reviews?page=${page}`),
  respond: (reviewId: string, response: string) => apiFetch<unknown>(`/provider/travel/reviews/${reviewId}/response`, { method: "POST", body: { response } }),
  finance: (from?: string, to?: string) => apiFetch<TravelProviderFinanceDto>(`/provider/travel/finance${toQuery({ from, to })}`),
};

export interface AdminTravelListingRow {
  id: string;
  title: string;
  type: TravelListingType;
  city: string;
  status: TravelListingStatus;
  isVerified: boolean;
  isPubliclyListed: boolean;
  organization: { id: string; name: string; verificationStatus: string };
  unitCount: number;
  mediaCount: number;
  bookingCount: number;
  hasPetPolicy: boolean;
  submittedAt: string | null;
  updatedAt: string;
}

export interface AdminTravelBookingRow {
  id: string;
  reference: string;
  status: TravelBookingStatus;
  paymentStatus: string;
  listingTitle: string;
  city: string;
  providerName: string;
  checkIn: string;
  checkOut: string;
  totalAmountIrr: number;
  payNowAmountIrr: number;
  refundAmountIrr: number;
  createdAt: string;
}

export interface AdminTravelBookingDetail {
  booking: TravelBookingDto;
  travelerFirstName: string;
  payment: { id: string; amount: number; status: string; provider: string } | null;
  refunds: { id: string; amount: number; status: string; reason: string | null; createdAt: string }[];
  supportCases: { id: string; caseNumber: string; status: string; subject: string }[];
}

export interface AdminTravelReviewRow {
  id: string;
  listingTitle: string;
  overall: number;
  body: string | null;
  status: "PUBLISHED" | "HIDDEN";
  hiddenReason: string | null;
  providerResponse: string | null;
  createdAt: string;
}

export interface RequirementRuleInput {
  country: string;
  city?: string | null;
  requirementType: TravelRequirementType;
  title: string;
  description: string;
  species?: string[];
  source: string;
  sourceUrl?: string | null;
  verifiedAt: string;
  validUntil?: string | null;
  status?: "ACTIVE" | "NEEDS_REVIEW" | "RETIRED";
}

export const adminTravelService = {
  listings: (p: { status?: string; q?: string; page?: number } = {}) => apiFetch<PaginatedDto<AdminTravelListingRow>>(`/admin/travel/listings${toQuery(p)}`),
  listing: (id: string) => apiFetch<{ listing: TravelListingDto; organization: { id: string; name: string; type: string; verificationStatus: string } | null; history: { action: string; reason: string | null; createdAt: string }[] }>(`/admin/travel/listings/${id}`),
  moderate: (id: string, action: "APPROVE" | "REQUEST_CORRECTION" | "SUSPEND" | "REINSTATE", note?: string) => apiFetch<{ listing: TravelListingDto }>(`/admin/travel/listings/${id}/moderate`, { method: "POST", body: { action, note } }),
  verify: (id: string, isVerified: boolean, reason: string) => apiFetch<unknown>(`/admin/travel/listings/${id}/verification`, { method: "POST", body: { isVerified, reason } }),
  bookings: (p: { status?: string; q?: string; page?: number } = {}) => apiFetch<PaginatedDto<AdminTravelBookingRow>>(`/admin/travel/bookings${toQuery(p)}`),
  booking: (id: string) => apiFetch<AdminTravelBookingDetail>(`/admin/travel/bookings/${id}`),
  reviews: (p: { status?: string; page?: number } = {}) => apiFetch<PaginatedDto<AdminTravelReviewRow>>(`/admin/travel/reviews${toQuery(p)}`),
  reviewVisibility: (id: string, hidden: boolean, reason: string) => apiFetch<unknown>(`/admin/travel/reviews/${id}/visibility`, { method: "PATCH", body: { hidden, reason } }),
  rules: (p: { country?: string; status?: string } = {}) => apiFetch<TravelRequirementRuleDto[]>(`/admin/travel/requirement-rules${toQuery(p)}`),
  createRule: (input: RequirementRuleInput) => apiFetch<TravelRequirementRuleDto>("/admin/travel/requirement-rules", { method: "POST", body: input }),
  updateRule: (id: string, input: RequirementRuleInput) => apiFetch<TravelRequirementRuleDto>(`/admin/travel/requirement-rules/${id}`, { method: "PATCH", body: input }),
  partners: () => apiFetch<{ id: string; name: string; type: string; verificationStatus: string; listingCount: number; bookingCount: number }[]>("/admin/travel/partners"),
  analytics: (days = 30) => apiFetch<AdminTravelAnalyticsDto>(`/admin/travel/analytics?days=${days}`),
};

export interface InsurerContextDto {
  providerId: string;
  providerName: string;
  role: "OWNER" | "UNDERWRITING" | "VIEWER";
}

export const insurerPortalService = {
  me: () => apiFetch<InsurerContextDto>("/insurer/me"),
  products: () => apiFetch<{ id: string; name: string; status: string; isPubliclyListed: boolean; coverageTypes: string[]; speciesEligibility: string[]; _count: { applications: number } }[]>("/insurer/products"),
  applications: (p: { status?: InsuranceApplicationStatus; page?: number } = {}) => apiFetch<PaginatedDto<InsurerApplicationRowDto>>(`/insurer/applications${toQuery(p)}`),
  application: (id: string) => apiFetch<InsurerApplicationDetailDto>(`/insurer/applications/${id}`),
  decide: (id: string, input: { status: InsuranceApplicationStatus; message?: string; externalReference?: string }) => apiFetch<InsurerApplicationDetailDto>(`/insurer/applications/${id}/decision`, { method: "POST", body: input }),
  team: () => apiFetch<{ id: string; displayName: string | null; role: string; isActive: boolean; createdAt: string }[]>("/insurer/team"),
};

export interface AdminInsuranceApplicationRow {
  id: string;
  productName: string;
  providerName: string;
  petSpecies: string;
  status: InsuranceApplicationStatus;
  eligibilityStatus: string;
  consentAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export const adminInsuranceOpsService = {
  applications: (p: { status?: string; page?: number } = {}) => apiFetch<PaginatedDto<AdminInsuranceApplicationRow>>(`/admin/insurance/applications${toQuery(p)}`),
  members: (providerId: string) => apiFetch<{ id: string; userId: string; displayName: string | null; email: string | null; role: string; isActive: boolean }[]>(`/admin/insurance/providers/${providerId}/members`),
  grant: (providerId: string, email: string, role: string) => apiFetch<unknown>(`/admin/insurance/providers/${providerId}/members`, { method: "POST", body: { email, role } }),
  revoke: (providerId: string, membershipId: string) => apiFetch<unknown>(`/admin/insurance/providers/${providerId}/members/${membershipId}`, { method: "DELETE" }),
};
