import type { AdminBookingMoneyDto, AdminRefundApprovalDto, PaginatedDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type StaffRefundChoice = "POLICY" | "FULL" | "AMOUNT" | "NONE";

const base = (kind: "BOOKING" | "TRAVEL_BOOKING", id: string) => (kind === "BOOKING" ? `/admin/service-bookings/${id}` : `/admin/travel/bookings/${id}`);

/** Staff cancel/refund for service bookings and stays, and the finance refund-approval queue. */
export const adminBookingMoneyService = {
  money: (kind: "BOOKING" | "TRAVEL_BOOKING", id: string) => apiFetch<AdminBookingMoneyDto>(`${base(kind, id)}/money`),
  cancel: (kind: "BOOKING" | "TRAVEL_BOOKING", id: string, input: { reason: string; refund: StaffRefundChoice; amount?: number }) =>
    apiFetch<AdminBookingMoneyDto>(`${base(kind, id)}/cancel`, { method: "POST", body: input }),
  refund: (kind: "BOOKING" | "TRAVEL_BOOKING", id: string, input: { amount: number; reason: string }) =>
    apiFetch<AdminBookingMoneyDto>(`${base(kind, id)}/refund`, { method: "POST", body: input }),
  approvals: (input: { status?: string; page?: number } = {}) => {
    const q = new URLSearchParams();
    if (input.status) q.set("status", input.status);
    q.set("page", String(input.page ?? 1));
    return apiFetch<PaginatedDto<AdminRefundApprovalDto>>(`/admin/transactions/refund-approvals?${q.toString()}`);
  },
  approve: (id: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/approve`, { method: "PATCH" }),
  reject: (id: string, reason: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/reject`, { method: "PATCH", body: { reason } }),
  execute: (id: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/execute`, { method: "PATCH" }),
  disputeOutcome: (disputeId: string) =>
    apiFetch<{ disputeId: string; status: string; refundApproval: { id: string; status: string; amount: number; subjectType: string } | null }>(`/admin/disputes/${disputeId}/outcome`),
  disputeRefund: (disputeId: string, input: { amount: number; reason: string }) =>
    apiFetch<{ disputeId: string; status: string; refundApproval: { id: string; status: string; amount: number; subjectType: string } | null }>(`/admin/disputes/${disputeId}/refund-outcome`, { method: "POST", body: input }),
};
