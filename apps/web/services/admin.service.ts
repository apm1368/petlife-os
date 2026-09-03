import type {
  AdminAuditLogDto,
  AdminCustomerListItemDto,
  AdminDashboardSummaryDto,
  AdminOrderFinancialsDto,
  AdminPiiRevealDto,
  AdminPriority,
  AdminProviderOrgSummaryDto,
  AdminRefundApprovalDto,
  AdminSearchResultDto,
  AdminSellerOrgSummaryDto,
  AdminSessionContextDto,
  AdminTaskDto,
  AdminTaskStatus,
  AppealDto,
  AppealStatus,
  Customer360Dto,
  DisputeDto,
  DisputeEvidenceActorType,
  DisputeEvidenceDto,
  DisputeStatus,
  DisputeSubjectType,
  InternalNoteDto,
  PaginatedDto,
  ProviderVerificationStatus,
  SellerVerificationStatus,
  SupportCaseCategory,
  SupportCaseContextDto,
  SupportCaseDetailDto,
  SupportCaseStatus,
  SupportCaseSummaryDto,
  SupportMessageDto,
  SupportMessageVisibility,
  TrustActionDto,
  TrustActionType,
  TrustCaseDto,
  TrustCaseSeverity,
  TrustCaseStatus,
  TrustSubjectType,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface AdminPaginationInput {
  page?: number;
  pageSize?: number;
}

/**
 * The one client for every `/admin/*` route (spec's own admin REST
 * surface, Handoff 11). Mirrors sellerOsService's own "flat object of
 * typed methods, one per endpoint" shape rather than one class per
 * sub-domain — the admin frontend is a single cohesive shell, not several
 * independently-mountable apps.
 */
export const adminService = {
  getMe: () => apiFetch<AdminSessionContextDto>("/admin/me"),
  getDashboard: () => apiFetch<AdminDashboardSummaryDto>("/admin/dashboard"),
  search: (q: string) => apiFetch<AdminSearchResultDto>(`/admin/search${toQueryString({ q })}`),

  // Customer 360
  listCustomers: (q: string, input: AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<AdminCustomerListItemDto>>(`/admin/customers${toQueryString({ q, page: input.page, pageSize: input.pageSize })}`),
  getCustomer360: (userId: string) => apiFetch<Customer360Dto>(`/admin/customers/${userId}`),
  revealPii: (userId: string, field: "email" | "phone", reason: string) => apiFetch<AdminPiiRevealDto>(`/admin/customers/${userId}/reveal`, { method: "POST", body: { field, reason } }),
  addNote: (entityType: InternalNoteDto["entityType"], entityId: string, body: string) => apiFetch<InternalNoteDto>("/admin/notes", { method: "POST", body: { entityType, entityId, body } }),

  // Support cases
  listSupportCases: (
    input: { status?: SupportCaseStatus; assignedAdminId?: string; category?: SupportCaseCategory; search?: string; createdFrom?: string; createdTo?: string } & AdminPaginationInput = {},
  ) =>
    apiFetch<PaginatedDto<SupportCaseSummaryDto>>(
      `/admin/support${toQueryString({
        status: input.status,
        assignedAdminId: input.assignedAdminId,
        category: input.category,
        search: input.search,
        createdFrom: input.createdFrom,
        createdTo: input.createdTo,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    ),
  getSupportCaseContext: (caseId: string) => apiFetch<SupportCaseContextDto>(`/admin/support/${caseId}/context`),
  createSupportCase: (input: {
    requesterUserId: string;
    householdId?: string;
    petId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    subject: string;
    description: string;
    category: SupportCaseCategory;
    priority?: AdminPriority;
  }) => apiFetch<SupportCaseSummaryDto>("/admin/support", { method: "POST", body: input }),
  getSupportCase: (caseId: string) => apiFetch<SupportCaseDetailDto>(`/admin/support/${caseId}`),
  assignSupportCase: (caseId: string, assigneeAdminId: string) => apiFetch<SupportCaseSummaryDto>(`/admin/support/${caseId}/assign`, { method: "PATCH", body: { assigneeAdminId } }),
  transitionSupportCase: (caseId: string, status: SupportCaseStatus) => apiFetch<SupportCaseSummaryDto>(`/admin/support/${caseId}/status`, { method: "PATCH", body: { status } }),
  postSupportMessage: (caseId: string, body: string, visibility: SupportMessageVisibility) =>
    apiFetch<SupportMessageDto>(`/admin/support/${caseId}/messages`, { method: "POST", body: { body, visibility } }),
  addSupportNote: (caseId: string, body: string) => apiFetch<InternalNoteDto>(`/admin/support/${caseId}/notes`, { method: "POST", body: { body } }),

  // Disputes
  listDisputes: (input: { status?: DisputeStatus; assignedAdminId?: string } & AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<DisputeDto>>(`/admin/disputes${toQueryString({ status: input.status, assignedAdminId: input.assignedAdminId, page: input.page, pageSize: input.pageSize })}`),
  createDispute: (input: { subjectType: DisputeSubjectType; subjectId: string; raisedByUserId?: string; supportCaseId?: string; claim: string }) =>
    apiFetch<DisputeDto>("/admin/disputes", { method: "POST", body: input }),
  getDispute: (disputeId: string) => apiFetch<DisputeDto>(`/admin/disputes/${disputeId}`),
  assignDispute: (disputeId: string, assigneeAdminId: string) => apiFetch<DisputeDto>(`/admin/disputes/${disputeId}/assign`, { method: "PATCH", body: { assigneeAdminId } }),
  addDisputeEvidence: (disputeId: string, input: { statement: string; attachmentRef?: string; actorType: DisputeEvidenceActorType; actorUserId?: string }) =>
    apiFetch<DisputeEvidenceDto>(`/admin/disputes/${disputeId}/evidence`, { method: "POST", body: input }),
  transitionDispute: (disputeId: string, status: DisputeStatus, resolutionSummary?: string) =>
    apiFetch<DisputeDto>(`/admin/disputes/${disputeId}/status`, { method: "PATCH", body: { status, resolutionSummary } }),

  // Trust & Safety
  listTrustCases: (input: { status?: TrustCaseStatus; assignedAdminId?: string } & AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<TrustCaseDto>>(`/admin/trust/cases${toQueryString({ status: input.status, assignedAdminId: input.assignedAdminId, page: input.page, pageSize: input.pageSize })}`),
  openTrustCase: (input: { subjectType: TrustSubjectType; subjectId: string; reason: string; severity?: TrustCaseSeverity }) =>
    apiFetch<TrustCaseDto>("/admin/trust/cases", { method: "POST", body: input }),
  getTrustCase: (trustCaseId: string) => apiFetch<TrustCaseDto>(`/admin/trust/cases/${trustCaseId}`),
  assignTrustCase: (trustCaseId: string, assigneeAdminId: string) => apiFetch<TrustCaseDto>(`/admin/trust/cases/${trustCaseId}/assign`, { method: "PATCH", body: { assigneeAdminId } }),
  transitionTrustCase: (trustCaseId: string, status: TrustCaseStatus) => apiFetch<TrustCaseDto>(`/admin/trust/cases/${trustCaseId}/status`, { method: "PATCH", body: { status } }),
  takeTrustAction: (trustCaseId: string, input: { actionType: TrustActionType; reason: string }) =>
    apiFetch<TrustActionDto>(`/admin/trust/cases/${trustCaseId}/actions`, { method: "POST", body: input }),
  submitAppeal: (trustActionId: string, input: { appellantUserId: string; reason: string }) =>
    apiFetch<AppealDto>(`/admin/trust/actions/${trustActionId}/appeals`, { method: "POST", body: input }),
  resolveAppeal: (appealId: string, input: { status: AppealStatus; resolution: string }) => apiFetch<AppealDto>(`/admin/trust/appeals/${appealId}`, { method: "PATCH", body: input }),

  // Verification
  transitionProviderVerification: (providerOrganizationId: string, status: ProviderVerificationStatus, reason: string) =>
    apiFetch<{ id: string; verificationStatus: ProviderVerificationStatus }>(`/admin/providers/${providerOrganizationId}/verification`, { method: "PATCH", body: { status, reason } }),
  transitionSellerVerification: (sellerOrganizationId: string, status: SellerVerificationStatus, reason: string) =>
    apiFetch<{ id: string; verificationStatus: SellerVerificationStatus }>(`/admin/sellers/${sellerOrganizationId}/verification`, { method: "PATCH", body: { status, reason } }),

  // Provider/Seller org lookups
  listProviders: (q: string, input: AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<AdminProviderOrgSummaryDto>>(`/admin/providers${toQueryString({ q, page: input.page, pageSize: input.pageSize })}`),
  listSellers: (q: string, input: AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<AdminSellerOrgSummaryDto>>(`/admin/sellers${toQueryString({ q, page: input.page, pageSize: input.pageSize })}`),

  // Tasks
  listTasks: (input: { status?: AdminTaskStatus; assigneeAdminId?: string } & AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<AdminTaskDto>>(`/admin/tasks${toQueryString({ status: input.status, assigneeAdminId: input.assigneeAdminId, page: input.page, pageSize: input.pageSize })}`),
  createTask: (input: { title: string; description?: string; assigneeAdminId?: string; dueAt?: string; priority?: AdminPriority; relatedEntityType?: string; relatedEntityId?: string }) =>
    apiFetch<AdminTaskDto>("/admin/tasks", { method: "POST", body: input }),
  updateTask: (taskId: string, input: { assigneeAdminId?: string; status?: AdminTaskStatus }) => apiFetch<AdminTaskDto>(`/admin/tasks/${taskId}`, { method: "PATCH", body: input }),

  // Finance / refunds
  getOrderFinancials: (orderId: string) => apiFetch<AdminOrderFinancialsDto>(`/admin/transactions/orders/${orderId}`),
  requestRefundApproval: (input: { orderId: string; amount: number; reason: string; idempotencyKey?: string }) =>
    apiFetch<AdminRefundApprovalDto>("/admin/transactions/refund-approvals", { method: "POST", body: input, idempotencyKey: input.idempotencyKey }),
  getRefundApproval: (id: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}`),
  approveRefund: (id: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/approve`, { method: "PATCH" }),
  rejectRefund: (id: string, reason?: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/reject`, { method: "PATCH", body: { reason } }),
  executeRefund: (id: string) => apiFetch<AdminRefundApprovalDto>(`/admin/transactions/refund-approvals/${id}/execute`, { method: "PATCH" }),

  // Audit
  listAudit: (input: { entityType?: string; entityId?: string; adminUserId?: string } & AdminPaginationInput = {}) =>
    apiFetch<PaginatedDto<AdminAuditLogDto>>(
      `/admin/audit${toQueryString({ entityType: input.entityType, entityId: input.entityId, adminUserId: input.adminUserId, page: input.page, pageSize: input.pageSize })}`,
    ),
};
