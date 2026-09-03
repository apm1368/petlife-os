import type {
  AdminSellerFinanceSummaryDto,
  FinancialConfidence,
  MarketplaceReconciliationStatus,
  MarketplaceSettlementImportSource,
  MarketplaceSettlementReconciliationResultDto,
  MarketplaceSettlementStatementDto,
  PaginatedDto,
  SellerAdjustmentDto,
  SellerAdjustmentReasonCode,
  SellerAdjustmentType,
  SellerSettlementDetailDto,
  SellerSettlementDto,
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

export interface MarketplaceSettlementLineInput {
  externalOrderId: string;
  amount: number;
  feeAmount?: number;
  feeConfidence?: FinancialConfidence;
  description?: string;
}

/** Admin Seller Finance / Settlements surface (Handoff 14) — mirrors adminService's own shape and conventions rather than extending that file, since it's a self-contained domain the same way notifications/admin-audit already got their own service. */
export const adminFinanceService = {
  listSellerFinance: (q: string | undefined, page = 1, pageSize = 20) =>
    apiFetch<PaginatedDto<AdminSellerFinanceSummaryDto>>(`/admin/seller-finance${toQueryString({ q, page, pageSize })}`),
  getSellerFinance: (sellerId: string) => apiFetch<AdminSellerFinanceSummaryDto>(`/admin/seller-finance/${sellerId}`),

  listSettlements: (sellerOrganizationId?: string) => apiFetch<SellerSettlementDto[]>(`/admin/settlements${toQueryString({ sellerOrganizationId })}`),
  getSettlement: (id: string) => apiFetch<SellerSettlementDetailDto>(`/admin/settlements/${id}`),
  calculateSettlement: (input: { sellerOrganizationId: string; periodStart: string; periodEnd: string }, idempotencyKey?: string) =>
    apiFetch<SellerSettlementDto>("/admin/settlements/calculate", { method: "POST", body: input, idempotencyKey }),
  approveSettlement: (id: string) => apiFetch<SellerSettlementDto>(`/admin/settlements/${id}/approve`, { method: "POST" }),
  payoutSettlement: (id: string, payoutReference: string | undefined, idempotencyKey?: string) =>
    apiFetch<SellerSettlementDto>(`/admin/settlements/${id}/payout`, { method: "POST", body: { payoutReference }, idempotencyKey }),
  cancelSettlement: (id: string, reason: string) => apiFetch<SellerSettlementDto>(`/admin/settlements/${id}/cancel`, { method: "POST", body: { reason } }),
  markSettlementFailed: (id: string, reason: string) => apiFetch<SellerSettlementDto>(`/admin/settlements/${id}/mark-failed`, { method: "POST", body: { reason } }),

  listAdjustments: (sellerId: string) => apiFetch<SellerAdjustmentDto[]>(`/admin/seller-finance/${sellerId}/adjustments`),
  createAdjustment: (
    sellerId: string,
    input: { type: SellerAdjustmentType; reasonCode: SellerAdjustmentReasonCode; amountIrr: number; reason: string; evidenceReference?: string },
    idempotencyKey?: string,
  ) => apiFetch<SellerAdjustmentDto>(`/admin/seller-finance/${sellerId}/adjustments`, { method: "POST", body: input, idempotencyKey }),

  importMarketplaceSettlement: (
    input: { marketplaceChannelAccountId: string; source: MarketplaceSettlementImportSource; periodStart: string; periodEnd: string; currency: string; lines: MarketplaceSettlementLineInput[] },
    idempotencyKey?: string,
  ) => apiFetch<MarketplaceSettlementStatementDto>("/admin/marketplace-settlements/import", { method: "POST", body: input, idempotencyKey }),
  listMarketplaceStatements: (sellerOrganizationId?: string) => apiFetch<MarketplaceSettlementStatementDto[]>(`/admin/marketplace-settlements${toQueryString({ sellerOrganizationId })}`),
  getMarketplaceStatement: (id: string) => apiFetch<MarketplaceSettlementStatementDto>(`/admin/marketplace-settlements/${id}`),

  listReconciliation: (status?: MarketplaceReconciliationStatus) => apiFetch<MarketplaceSettlementReconciliationResultDto[]>(`/admin/marketplace-reconciliation${toQueryString({ status })}`),
  getReconciliation: (id: string) => apiFetch<MarketplaceSettlementReconciliationResultDto>(`/admin/marketplace-reconciliation/${id}`),
  resolveReconciliation: (id: string, notes: string) => apiFetch<MarketplaceSettlementReconciliationResultDto>(`/admin/marketplace-reconciliation/${id}/resolve`, { method: "POST", body: { notes } }),
};
