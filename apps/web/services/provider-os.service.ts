import type {
  ProviderAvailabilityExceptionDto,
  ProviderAvailabilityRuleDto,
  ProviderBookingDetailDto,
  ProviderBookingSummaryDto,
  ProviderContextDto,
  ProviderOverviewDto,
  ProviderServiceDto,
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
      })}`,
    ),
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
