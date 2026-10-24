import type {
  ProviderAvailabilityExceptionDto,
  ProviderAvailabilityRuleDto,
  ProviderBookingDetailDto,
  ProviderBookingSummaryDto,
  ProviderContextDto,
  ProviderOverviewDto,
  ProviderServiceDto,
  ProviderServiceVariantDto,
  ProviderTeamMemberDto,
  BookingProviderNoteDto,
  AvailabilityExceptionType,
  ServiceCategory,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ListProviderBookingsInput {
  today?: boolean;
  upcoming?: boolean;
  past?: boolean;
  cancelled?: boolean;
  category?: ServiceCategory;
  locationId?: string;
  providerUserId?: string;
  /** Request-to-book queue. */
  requests?: boolean;
  /** Calendar window (ISO). */
  from?: string;
  to?: string;
}

export interface ProviderFollowUpInput {
  type: "FOLLOW_UP" | "VACCINATION" | "MEDICATION" | "MONITORING" | "OTHER";
  title: string;
  detail?: string;
  dueAt: string;
}

export interface ProviderResource {
  id: string;
  locationId: string;
  name: string;
  type: string;
  isActive: boolean;
}

export interface ProviderStaffMember {
  providerUserId: string;
  displayName: string | null;
  role: string;
  displayTitle: string | null;
  publicBio: string | null;
  isBookable: boolean;
  serviceIds: string[];
}

export interface ProviderWaitlistEntry {
  id: string;
  petName: string;
  serviceId: string;
  serviceName: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  createdAt: string;
}

export interface ProviderReviewRow {
  id: string;
  rating: number;
  body: string | null;
  authorName: string;
  serviceName: string | null;
  providerResponse: string | null;
  status: string;
  createdAt: string;
}

export interface ProviderAnalytics {
  periodDays: number;
  totalBookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  completionRate: number | null;
  revenue: number;
  revenueCurrency: string | null;
  reviewAverage: number | null;
  reviewCount: number;
  repeatClients: number;
  topServices: { serviceId: string; name: string; completed: number }[];
}

export interface CreateAvailabilityRuleInput {
  locationId: string;
  providerUserId?: string;
  serviceId?: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  timezone: string;
}

export interface CreateAvailabilityExceptionInput {
  locationId: string;
  providerUserId?: string;
  startAt: string;
  endAt: string;
  type: AvailabilityExceptionType;
  reason?: string;
  acknowledgeConflict?: boolean;
}

export const providerOsService = {
  getContext: () => apiFetch<ProviderContextDto>("/provider/me/context"),
  setContext: (providerOrganizationId: string) =>
    apiFetch<ProviderContextDto>("/provider/me/context", { method: "PUT", body: { providerOrganizationId } }),

  getOverview: () => apiFetch<ProviderOverviewDto>("/provider/me/overview"),

  listBookings: (input: ListProviderBookingsInput = {}) =>
    apiFetch<ProviderBookingSummaryDto[]>(
      `/provider/bookings${toQueryString({
        today: input.today ? "true" : undefined,
        upcoming: input.upcoming ? "true" : undefined,
        past: input.past ? "true" : undefined,
        cancelled: input.cancelled ? "true" : undefined,
        category: input.category,
        locationId: input.locationId,
        providerUserId: input.providerUserId,
        requests: input.requests ? "true" : undefined,
        from: input.from,
        to: input.to,
      })}`,
    ),
  acceptBooking: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/accept`, { method: "POST" }),
  rejectBooking: (id: string, reason: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/reject`, { method: "POST", body: { reason } }),
  markNoShow: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/no-show`, { method: "POST" }),
  completeWithFollowUps: (id: string, completionNote: string | undefined, followUps: ProviderFollowUpInput[]) =>
    apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/complete`, { method: "POST", body: { completionNote, followUps: followUps.length ? followUps : undefined } }),
  createVariant: (serviceId: string, input: { name: string; priceAmount: number | null; durationMinutes: number; description?: string }) =>
    apiFetch<ProviderServiceVariantDto>(`/provider/services/${serviceId}/variants`, { method: "POST", body: input }),
  updateVariant: (serviceId: string, variantId: string, patch: Partial<{ name: string; priceAmount: number | null; durationMinutes: number; isActive: boolean }>) =>
    apiFetch<ProviderServiceVariantDto>(`/provider/services/${serviceId}/variants/${variantId}`, { method: "PATCH", body: patch }),
  listResources: () => apiFetch<ProviderResource[]>("/provider/resources"),
  createResource: (input: { locationId: string; name: string; type: string }) => apiFetch<ProviderResource>("/provider/resources", { method: "POST", body: input }),
  updateResource: (id: string, patch: { name?: string; isActive?: boolean }) => apiFetch<ProviderResource>(`/provider/resources/${id}`, { method: "PATCH", body: patch }),
  listStaff: () => apiFetch<ProviderStaffMember[]>("/provider/staff"),
  setStaffServices: (providerUserId: string, serviceIds: string[]) => apiFetch<ProviderStaffMember>(`/provider/staff/${providerUserId}/services`, { method: "PUT", body: { serviceIds } }),
  updateStaff: (providerUserId: string, patch: { publicBio?: string | null; isBookable?: boolean; displayTitle?: string | null }) =>
    apiFetch<ProviderStaffMember>(`/provider/staff/${providerUserId}`, { method: "PATCH", body: patch }),
  listWaitlist: () => apiFetch<ProviderWaitlistEntry[]>("/provider/waitlist"),
  listReviews: () => apiFetch<ProviderReviewRow[]>("/provider/reviews"),
  respondToReview: (reviewId: string, response: string) => apiFetch<ProviderReviewRow>(`/provider/reviews/${reviewId}/respond`, { method: "POST", body: { response } }),
  analytics: (days = 30) => apiFetch<ProviderAnalytics>(`/provider/analytics?days=${days}`),
  getBooking: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}`),
  confirmBooking: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/confirm`, { method: "POST" }),
  cancelBooking: (id: string, reason?: string) =>
    apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/cancel`, { method: "POST", body: { reason } }),
  checkIn: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/check-in`, { method: "POST" }),
  start: (id: string) => apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/start`, { method: "POST" }),
  complete: (id: string, completionNote?: string) =>
    apiFetch<ProviderBookingDetailDto>(`/provider/bookings/${id}/complete`, { method: "POST", body: { completionNote } }),
  addNote: (id: string, content: string) =>
    apiFetch<BookingProviderNoteDto>(`/provider/bookings/${id}/notes`, { method: "POST", body: { content } }),

  listAvailabilityRules: () => apiFetch<ProviderAvailabilityRuleDto[]>("/provider/availability/rules"),
  createAvailabilityRule: (input: CreateAvailabilityRuleInput) =>
    apiFetch<ProviderAvailabilityRuleDto>("/provider/availability/rules", { method: "POST", body: input }),
  updateAvailabilityRule: (id: string, patch: Partial<CreateAvailabilityRuleInput>) =>
    apiFetch<ProviderAvailabilityRuleDto>(`/provider/availability/rules/${id}`, { method: "PATCH", body: patch }),
  deleteAvailabilityRule: (id: string) => apiFetch<void>(`/provider/availability/rules/${id}`, { method: "DELETE" }),

  listAvailabilityExceptions: () => apiFetch<ProviderAvailabilityExceptionDto[]>("/provider/availability/exceptions"),
  createAvailabilityException: (input: CreateAvailabilityExceptionInput) =>
    apiFetch<ProviderAvailabilityExceptionDto>("/provider/availability/exceptions", { method: "POST", body: input }),
  updateAvailabilityException: (id: string, patch: Partial<CreateAvailabilityExceptionInput>) =>
    apiFetch<ProviderAvailabilityExceptionDto>(`/provider/availability/exceptions/${id}`, { method: "PATCH", body: patch }),
  deleteAvailabilityException: (id: string) => apiFetch<void>(`/provider/availability/exceptions/${id}`, { method: "DELETE" }),

  listServices: () => apiFetch<ProviderServiceDto[]>("/provider/services"),
  getService: (id: string) => apiFetch<ProviderServiceDto>(`/provider/services/${id}`),
  updateService: (id: string, patch: Partial<ProviderServiceDto>) =>
    apiFetch<ProviderServiceDto>(`/provider/services/${id}`, { method: "PATCH", body: patch }),

  listTeam: () => apiFetch<ProviderTeamMemberDto[]>("/provider/team"),
};
