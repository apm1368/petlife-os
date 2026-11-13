import type { ApprovalModeValue, ApprovalScopeValue, PartnerApprovalModesDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type ApprovalPartnerKind = "services" | "shops";

/** Approval mode per partner (Admin → Partners profile): read with the profile's permissions, change with settings.manage. */
export const adminApprovalsService = {
  get: (kind: ApprovalPartnerKind, id: string) => apiFetch<PartnerApprovalModesDto>(`/admin/partners/${kind}/${id}/approval-modes`),
  set: (kind: ApprovalPartnerKind, id: string, scope: ApprovalScopeValue, mode: ApprovalModeValue, reason: string) =>
    apiFetch<PartnerApprovalModesDto>(`/admin/partners/${kind}/${id}/approval-modes/${scope}`, { method: "PUT", body: { mode, reason } }),
  clear: (kind: ApprovalPartnerKind, id: string, scope: ApprovalScopeValue, reason: string) =>
    apiFetch<PartnerApprovalModesDto>(`/admin/partners/${kind}/${id}/approval-modes/${scope}`, { method: "DELETE", body: { reason } }),
};
