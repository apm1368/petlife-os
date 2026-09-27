import { apiFetch } from "@/lib/api/client";

export interface AdminBookingRow {
  id: string;
  bookingNumber: string | null;
  status: string;
  paymentStatus: string;
  category: string;
  startAt: string;
  petName: string;
  providerName: string;
  serviceName: string;
  priceAmount: number | null;
  currency: string | null;
}

export interface AdminBookingDetail {
  id: string;
  bookingNumber: string | null;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  bookingMode: string;
  category: string;
  startAt: string;
  endAt: string;
  timezone: string;
  serviceName: string | null;
  variantName: string | null;
  priceAmount: number | null;
  depositAmount: number | null;
  discountAmount: number;
  currency: string | null;
  cancellationPolicy: string | null;
  freeCancellationHours: number | null;
  lateCancellationRefundPercent: number | null;
  cancelledReason: string | null;
  rejectedReason: string | null;
  pet: { id: string; name: string; species: string };
  customer: { id: string; displayName: string | null; email: string | null; phone: string | null };
  provider: { id: string; name: string; verificationStatus: string };
  location: { name: string | null; city: string };
  staff: { id: string; displayTitle: string | null } | null;
  healthAccess: { scopePreset: string; canViewHealth: boolean; canRecordClinicalData: boolean; expiresAt: string | null; revokedAt: string | null; reason: string | null } | null;
  timeline: { fromStatus: string | null; toStatus: string; actorType: string; reason: string | null; createdAt: string }[];
  payment: { id: string; amount: number; currency: string; status: string; provider: string } | null;
  refunds: { id: string; amount: number; status: string; reason: string | null; createdAt: string }[];
  supportCases: { id: string; caseNumber: string; status: string; subject: string }[];
  clinicalVisits: { id: string; status: string }[];
  review: { id: string; rating: number; status: string } | null;
  rescheduledTo: { id: string; bookingNumber: string | null } | null;
  rescheduledFrom: { id: string; bookingNumber: string | null } | null;
}

export interface AdminServiceRow {
  id: string;
  providerOrganizationId: string;
  providerName: string;
  name: string;
  category: string;
  type: string;
  isActive: boolean;
  bookingMode: string;
  paymentMode: string;
  priceAmount: number | null;
  variantCount: number;
  bookingCount: number;
}

export interface AdminReviewRow {
  id: string;
  providerName: string;
  bookingNumber: string | null;
  rating: number;
  body: string | null;
  status: string;
  hiddenReason: string | null;
  providerResponse: string | null;
  createdAt: string;
}

export interface AdminServicesAnalytics {
  periodDays: number;
  totalBookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  requested: number;
  rejected: number;
  expired: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  reviewAverage: number | null;
  reviewCount: number;
  waitlistActive: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const adminServicesService = {
  listBookings: (q: { status?: string; providerId?: string; q?: string; page?: number }) => apiFetch<{ total: number; page: number; items: AdminBookingRow[] }>(`/admin/service-bookings${qs(q)}`),
  getBooking: (id: string) => apiFetch<AdminBookingDetail>(`/admin/service-bookings/${id}`),
  listServices: (providerId?: string) => apiFetch<AdminServiceRow[]>(`/admin/provider-services${qs({ providerId })}`),
  setServiceActive: (id: string, active: boolean, reason: string) => apiFetch<{ id: string; isActive: boolean }>(`/admin/provider-services/${id}/${active ? "reactivate" : "deactivate"}`, { method: "POST", body: { reason } }),
  listReviews: (status?: string) => apiFetch<AdminReviewRow[]>(`/admin/provider-reviews${qs({ status })}`),
  hideReview: (id: string, reason: string) => apiFetch<unknown>(`/admin/provider-reviews/${id}/hide`, { method: "POST", body: { reason } }),
  waitlist: () => apiFetch<{ id: string; providerName: string; serviceName: string; windowStart: string; windowEnd: string; status: string; createdAt: string }[]>("/admin/service-waitlist"),
  analytics: (days = 30) => apiFetch<AdminServicesAnalytics>(`/admin/services-analytics?days=${days}`),
};
