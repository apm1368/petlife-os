import type { PaginatedDto, SellerFinanceSummaryDto, SellerSettlementDetailDto, SellerSettlementDto, SellerTransactionDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ListSellerTransactionsInput {
  from?: string;
  to?: string;
  settlementStatus?: string;
  orderId?: string;
  page?: number;
  pageSize?: number;
}

/** Seller-facing Finance surface (Handoff 14) — read-only, `:sellerId`-scoped exactly like sellerOsService, since isolation lives server-side in SellerAuthGuard, never client-enforced. */
export const sellerFinanceService = {
  getSummary: (sellerId: string) => apiFetch<SellerFinanceSummaryDto>(`/seller-organizations/${sellerId}/finance/summary`),

  listTransactions: (sellerId: string, input: ListSellerTransactionsInput = {}) =>
    apiFetch<PaginatedDto<SellerTransactionDto>>(
      `/seller-organizations/${sellerId}/finance/transactions${toQueryString({ from: input.from, to: input.to, settlementStatus: input.settlementStatus, orderId: input.orderId, page: input.page, pageSize: input.pageSize })}`,
    ),

  listSettlements: (sellerId: string) => apiFetch<SellerSettlementDto[]>(`/seller-organizations/${sellerId}/settlements`),
  getSettlement: (sellerId: string, settlementId: string) => apiFetch<SellerSettlementDetailDto>(`/seller-organizations/${sellerId}/settlements/${settlementId}`),
};
