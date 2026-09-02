import type { MarketplaceChannelAccount, MarketplaceListing, MarketplaceOrder, MarketplaceOrderItem } from "@prisma/client";
import type { MarketplaceChannelAccountDto, MarketplaceListingDto, MarketplaceOrderDto, MarketplaceOrderItemDto } from "@petlife/types";
import { MarketplaceChannelRegistry } from "./marketplace-channel-registry.service";

export function toChannelAccountDto(account: MarketplaceChannelAccount, registry: MarketplaceChannelRegistry): MarketplaceChannelAccountDto {
  return {
    id: account.id,
    sellerOrganizationId: account.sellerOrganizationId,
    provider: account.provider as unknown as MarketplaceChannelAccountDto["provider"],
    status: account.status as unknown as MarketplaceChannelAccountDto["status"],
    externalSellerId: account.externalSellerId,
    displayName: account.displayName,
    syncEnabled: account.syncEnabled,
    inventorySyncEnabled: account.inventorySyncEnabled,
    priceSyncEnabled: account.priceSyncEnabled,
    orderSyncEnabled: account.orderSyncEnabled,
    lastSuccessfulSyncAt: account.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastAttemptedSyncAt: account.lastAttemptedSyncAt?.toISOString() ?? null,
    lastErrorCode: account.lastErrorCode,
    lastErrorMessage: account.lastErrorMessage,
    capabilities: registry.getCapabilities(account.provider) as unknown as MarketplaceChannelAccountDto["capabilities"],
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toListingDto(listing: MarketplaceListing, canonicalAvailableQuantity: number | null): MarketplaceListingDto {
  return {
    id: listing.id,
    marketplaceChannelAccountId: listing.marketplaceChannelAccountId,
    provider: listing.provider as unknown as MarketplaceListingDto["provider"],
    sellerOfferId: listing.sellerOfferId,
    externalListingId: listing.externalListingId,
    externalProductId: listing.externalProductId,
    externalVariantId: listing.externalVariantId,
    status: listing.status as unknown as MarketplaceListingDto["status"],
    syncStatus: listing.syncStatus as unknown as MarketplaceListingDto["syncStatus"],
    publishedPriceIrr: listing.publishedPriceIrr,
    publishedInventory: listing.publishedInventory,
    canonicalAvailableQuantity,
    lastSyncedAt: listing.lastSyncedAt?.toISOString() ?? null,
    lastProviderObservedAt: listing.lastProviderObservedAt?.toISOString() ?? null,
    lastErrorCode: listing.lastErrorCode,
    lastErrorMessage: listing.lastErrorMessage,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

function toOrderItemDto(item: MarketplaceOrderItem): MarketplaceOrderItemDto {
  return {
    id: item.id,
    marketplaceListingId: item.marketplaceListingId,
    sellerOfferId: item.sellerOfferId,
    quantity: item.quantity,
    unitPriceAmount: item.unitPriceAmount,
    totalPriceAmount: item.totalPriceAmount,
  };
}

export function toMarketplaceOrderDto(order: MarketplaceOrder & { items: MarketplaceOrderItem[] }): MarketplaceOrderDto {
  return {
    id: order.id,
    provider: order.provider as unknown as MarketplaceOrderDto["provider"],
    marketplaceChannelAccountId: order.marketplaceChannelAccountId,
    sellerOrganizationId: order.sellerOrganizationId,
    externalOrderId: order.externalOrderId,
    status: order.status as unknown as MarketplaceOrderDto["status"],
    currency: order.currency,
    totalAmount: order.totalAmount,
    deliveryResponsibility: order.deliveryResponsibility as unknown as MarketplaceOrderDto["deliveryResponsibility"],
    paymentSource: order.paymentSource as unknown as MarketplaceOrderDto["paymentSource"],
    placedAt: order.placedAt.toISOString(),
    providerUpdatedAt: order.providerUpdatedAt?.toISOString() ?? null,
    mappedOrderId: order.mappedOrderId,
    items: order.items.map(toOrderItemDto),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
