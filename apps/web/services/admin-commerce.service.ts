import type {
  AdminCommerceAnalyticsDto,
  AdminCommerceOrderDetailDto,
  AdminCommerceOrderRowDto,
  AdminInventoryRowDto,
  AdminProductReviewRowDto,
  AdminProductRowDto,
  AdminRefundRequestDto,
  AdminSellerRowDto,
  AdminSellerOfferModerationDto,
  PaginatedDto,
  PromotionDto,
  PromotionInput,
  PromotionStatusName,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, String(value));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const adminCommerceService = {
  listOrders: (input: {
    status?: string;
    sellerId?: string;
    q?: string;
    refundRequested?: boolean;
    page?: number;
  }) => apiFetch<PaginatedDto<AdminCommerceOrderRowDto>>(`/admin/commerce/orders${qs(input)}`),
  getOrder: (id: string) => apiFetch<AdminCommerceOrderDetailDto>(`/admin/commerce/orders/${id}`),
  listRefundRequests: (input: { status?: string; page?: number }) =>
    apiFetch<PaginatedDto<AdminRefundRequestDto>>(`/admin/commerce/refund-requests${qs(input)}`),
  approveRefundRequest: (id: string, note?: string) =>
    apiFetch<AdminRefundRequestDto>(`/admin/commerce/refund-requests/${id}/approve`, {
      method: "POST",
      body: { note },
    }),
  rejectRefundRequest: (id: string, reason: string) =>
    apiFetch<AdminRefundRequestDto>(`/admin/commerce/refund-requests/${id}/reject`, {
      method: "POST",
      body: { reason },
    }),
  executeRefundApproval: (approvalId: string) =>
    apiFetch<{ id: string; status: string }>(`/admin/transactions/refund-approvals/${approvalId}/execute`, {
      method: "PATCH",
    }),
  listProducts: (input: { status?: string; q?: string; page?: number }) =>
    apiFetch<PaginatedDto<AdminProductRowDto>>(`/admin/commerce/products${qs(input)}`),
  listProductCategories: () => apiFetch<Array<{ id: string; name: string; slug: string }>>("/admin/commerce/product-categories"),
  listProductBrands: () => apiFetch<Array<{ id: string; name: string; slug: string }>>("/admin/commerce/product-brands"),
  listCatalogImports: () => apiFetch<Array<{
    id: string; status: string; submittedUrls: string[]; pagesVisited: number; productsSeen: number;
    productsImported: number; productsFailed: number; lastError: string | null; createdAt: string;
    targetCategory: { id: string; name: string };
    items: Array<{ id: string; sourceItemId: string; sourceUrl: string; sourceSnapshot: { title?: string; brandName?: string | null }; pendingSnapshot?: { title?: string; brandName?: string | null } | null; status: string; errorCode: string | null; errorDetail: string | null; product: { id: string; title: string; status: string } | null }>;
  }>>("/admin/commerce/catalog-imports"),
  createCatalogImport: (input: { urls: string[]; categoryId: string; brandId?: string; maxPages: number; maxProducts: number; idempotencyKey: string }) =>
    apiFetch("/admin/commerce/catalog-imports", { method: "POST", body: input }),
  cancelCatalogImport: (id: string) => apiFetch(`/admin/commerce/catalog-imports/${id}/cancel`, { method: "POST" }),
  applyCatalogSourceUpdate: (id: string, reason: string) => apiFetch(`/admin/commerce/catalog-import-items/${id}/apply-source-update`, { method: "POST", body: { reason } }),
  rejectCatalogSourceUpdate: (id: string, reason: string) => apiFetch(`/admin/commerce/catalog-import-items/${id}/reject-source-update`, { method: "POST", body: { reason } }),
  setProductStatus: (id: string, status: string, reason: string) =>
    apiFetch<{ id: string; status: string }>(`/admin/commerce/products/${id}/status`, {
      method: "PATCH",
      body: { status, reason },
    }),
  listSellerOffersForModeration: (input: { status?: string; q?: string; page?: number }) =>
    apiFetch<PaginatedDto<AdminSellerOfferModerationDto>>(`/admin/commerce/offers/moderation${qs(input)}`),
  getSellerOfferForModeration: (id: string) =>
    apiFetch<AdminSellerOfferModerationDto>(`/admin/commerce/offers/moderation/${id}`),
  decideSellerOfferModeration: (
    id: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
    expectedUpdatedAt: string,
  ) =>
    apiFetch<AdminSellerOfferModerationDto>(`/admin/commerce/offers/moderation/${id}/decision`, {
      method: "POST",
      body: { decision, reason, expectedUpdatedAt },
    }),
  listReviews: (input: { status?: string; page?: number }) =>
    apiFetch<PaginatedDto<AdminProductReviewRowDto>>(`/admin/commerce/reviews${qs(input)}`),
  setReviewVisibility: (id: string, hidden: boolean, reason: string) =>
    apiFetch<{ id: string; status: string }>(`/admin/commerce/reviews/${id}/visibility`, {
      method: "PATCH",
      body: { hidden, reason },
    }),
  listInventory: (input: { lowStock?: boolean; sellerId?: string; page?: number }) =>
    apiFetch<PaginatedDto<AdminInventoryRowDto>>(`/admin/commerce/inventory${qs(input)}`),
  listSellers: () => apiFetch<AdminSellerRowDto[]>("/admin/commerce/sellers"),
  analytics: (days: number) =>
    apiFetch<AdminCommerceAnalyticsDto>(`/admin/commerce/analytics${qs({ days })}`),
  listPromotions: (status?: PromotionStatusName) =>
    apiFetch<PromotionDto[]>(`/admin/commerce/promotions${qs({ status })}`),
  createPromotion: (input: PromotionInput) =>
    apiFetch<PromotionDto>("/admin/commerce/promotions", { method: "POST", body: input }),
  updatePromotion: (id: string, input: Partial<PromotionInput>) =>
    apiFetch<PromotionDto>(`/admin/commerce/promotions/${id}`, { method: "PATCH", body: input }),
  transitionPromotion: (id: string, status: "ACTIVE" | "PAUSED" | "ENDED") =>
    apiFetch<PromotionDto>(`/admin/commerce/promotions/${id}/status`, { method: "POST", body: { status } }),
};
