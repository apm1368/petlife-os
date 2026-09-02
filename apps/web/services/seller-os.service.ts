import type {
  InventoryMovementDto,
  MarketplaceChannelAccountDto,
  MarketplaceListingDto,
  MarketplaceProvider,
  MarketplaceListingStatus,
  MarketplaceListingSyncStatus,
  MarketplaceReconciliationResultDto,
  OrderDetailDto,
  OrderStatus,
  PaginatedDto,
  SellerContextDto,
  SellerDashboardDto,
  SellerMembershipRole,
  SellerOrderSummaryDto,
  SellerOrganizationDetailDto,
  SellerOsOfferDto,
  SellerOfferStatus,
  SellerTeamMemberDto,
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

export interface ListSellerOffersInput {
  search?: string;
  status?: SellerOfferStatus;
  lowStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListSellerOrdersInput {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

export interface ListMarketplaceListingsInput {
  channelAccountId?: string;
  status?: MarketplaceListingStatus;
  syncStatus?: MarketplaceListingSyncStatus;
  page?: number;
  pageSize?: number;
}

/**
 * Every call is `:sellerId`-scoped in the path (never an implicit "active
 * organization"), mirroring SellerAuthGuard's own design — see
 * ResolvedSellerContext's doc comment on the API side.
 */
export const sellerOsService = {
  getContext: () => apiFetch<SellerContextDto>("/seller-context"),
  setContext: (sellerOrganizationId: string) => apiFetch<SellerContextDto>("/seller-context", { method: "POST", body: { sellerOrganizationId } }),

  getOrganization: (sellerId: string) => apiFetch<SellerOrganizationDetailDto>(`/seller-organizations/${sellerId}`),
  updateOrganization: (sellerId: string, patch: Partial<Pick<SellerOrganizationDetailDto, "supportContactEmail" | "supportContactPhone" | "timezone" | "city" | "description">>) =>
    apiFetch<SellerOrganizationDetailDto>(`/seller-organizations/${sellerId}`, { method: "PATCH", body: patch }),

  getDashboard: (sellerId: string) => apiFetch<SellerDashboardDto>(`/seller-organizations/${sellerId}/dashboard`),

  listOrders: (sellerId: string, input: ListSellerOrdersInput = {}) =>
    apiFetch<PaginatedDto<SellerOrderSummaryDto>>(`/seller-organizations/${sellerId}/orders${toQueryString({ status: input.status, page: input.page, pageSize: input.pageSize })}`),
  getOrder: (sellerId: string, orderId: string) => apiFetch<OrderDetailDto & { source: string | null; externalOrderId: string | null; paymentSource: string }>(`/seller-organizations/${sellerId}/orders/${orderId}`),

  listOffers: (sellerId: string, input: ListSellerOffersInput = {}) =>
    apiFetch<PaginatedDto<SellerOsOfferDto>>(`/seller-organizations/${sellerId}/offers${toQueryString({ search: input.search, status: input.status, lowStock: input.lowStock, page: input.page, pageSize: input.pageSize })}`),
  getOffer: (sellerId: string, offerId: string) => apiFetch<SellerOsOfferDto>(`/seller-organizations/${sellerId}/offers/${offerId}`),
  createOffer: (sellerId: string, input: { productVariantId: string; priceAmount: number; compareAtAmount?: number; sellerSku?: string; initialOnHand?: number }) =>
    apiFetch<SellerOsOfferDto>(`/seller-organizations/${sellerId}/offers`, { method: "POST", body: input }),
  updateOffer: (sellerId: string, offerId: string, patch: { priceAmount?: number; compareAtAmount?: number; sellerSku?: string; status?: SellerOfferStatus }) =>
    apiFetch<SellerOsOfferDto>(`/seller-organizations/${sellerId}/offers/${offerId}`, { method: "PATCH", body: patch }),

  listInventory: (sellerId: string, input: ListSellerOffersInput = {}) =>
    apiFetch<PaginatedDto<SellerOsOfferDto>>(`/seller-organizations/${sellerId}/inventory${toQueryString({ search: input.search, status: input.status, lowStock: input.lowStock, page: input.page, pageSize: input.pageSize })}`),
  adjustInventory: (sellerId: string, inventoryItemId: string, input: { mode: "DELTA" | "ABSOLUTE"; quantity: number; reason?: string }) =>
    apiFetch<SellerOsOfferDto>(`/seller-organizations/${sellerId}/inventory/${inventoryItemId}`, { method: "PATCH", body: input }),
  getInventoryHistory: (sellerId: string, inventoryItemId: string, page = 1, pageSize = 20) =>
    apiFetch<PaginatedDto<InventoryMovementDto>>(`/seller-organizations/${sellerId}/inventory/${inventoryItemId}/history${toQueryString({ page, pageSize })}`),

  listTeam: (sellerId: string) => apiFetch<SellerTeamMemberDto[]>(`/seller-organizations/${sellerId}/members`),
  inviteTeamMember: (sellerId: string, input: { email?: string; phone?: string; role: SellerMembershipRole }) =>
    apiFetch<SellerTeamMemberDto>(`/seller-organizations/${sellerId}/members`, { method: "POST", body: input }),
  updateTeamMemberRole: (sellerId: string, membershipId: string, role: SellerMembershipRole) =>
    apiFetch<SellerTeamMemberDto>(`/seller-organizations/${sellerId}/members/${membershipId}`, { method: "PATCH", body: { role } }),
  removeTeamMember: (sellerId: string, membershipId: string) => apiFetch<SellerTeamMemberDto>(`/seller-organizations/${sellerId}/members/${membershipId}`, { method: "DELETE" }),

  listChannels: (sellerId: string) => apiFetch<MarketplaceChannelAccountDto[]>(`/seller-organizations/${sellerId}/channels`),
  connectChannel: (sellerId: string, provider: MarketplaceProvider, displayName?: string) =>
    apiFetch<MarketplaceChannelAccountDto>(`/seller-organizations/${sellerId}/channels`, { method: "POST", body: { provider, displayName } }),
  updateChannel: (sellerId: string, channelAccountId: string, patch: { syncEnabled?: boolean; inventorySyncEnabled?: boolean; priceSyncEnabled?: boolean; orderSyncEnabled?: boolean }) =>
    apiFetch<MarketplaceChannelAccountDto>(`/seller-organizations/${sellerId}/channels/${channelAccountId}`, { method: "PATCH", body: patch }),

  listMarketplaceListings: (sellerId: string, input: ListMarketplaceListingsInput = {}) =>
    apiFetch<PaginatedDto<MarketplaceListingDto>>(
      `/seller-organizations/${sellerId}/marketplace-listings${toQueryString({ channelAccountId: input.channelAccountId, status: input.status, syncStatus: input.syncStatus, page: input.page, pageSize: input.pageSize })}`,
    ),
  createMarketplaceListing: (sellerId: string, input: { marketplaceChannelAccountId: string; sellerOfferId: string }) =>
    apiFetch<MarketplaceListingDto>(`/seller-organizations/${sellerId}/marketplace-listings`, { method: "POST", body: input }),
  publishMarketplaceListing: (sellerId: string, listingId: string) =>
    apiFetch<MarketplaceListingDto>(`/seller-organizations/${sellerId}/marketplace-listings/${listingId}/publish`, { method: "POST" }),
  syncMarketplaceListing: (sellerId: string, listingId: string) =>
    apiFetch<MarketplaceListingDto>(`/seller-organizations/${sellerId}/marketplace-listings/${listingId}/sync`, { method: "POST" }),
  deactivateMarketplaceListing: (sellerId: string, listingId: string) =>
    apiFetch<MarketplaceListingDto>(`/seller-organizations/${sellerId}/marketplace-listings/${listingId}/deactivate`, { method: "POST" }),
  reconcileMarketplaceListing: (sellerId: string, listingId: string) =>
    apiFetch<MarketplaceReconciliationResultDto>(`/seller-organizations/${sellerId}/marketplace-listings/${listingId}/reconcile`, { method: "POST" }),
};
