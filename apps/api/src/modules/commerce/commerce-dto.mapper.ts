import type { Brand, InventoryItem, ProductCategory, ProductVariant, SellerOffer, SellerOrganization } from "@prisma/client";
import type { BrandDto, ProductCategoryDto, ProductVariantDto, SellerOfferDto, SellerOrganizationSummaryDto } from "@petlife/types";

/**
 * Shared mapping helpers used across the Commerce Core modules (Catalog,
 * Cart, Checkout, Orders) — kept in one place so the shape of a seller/offer
 * summary only needs updating once, mirroring the precedent set by
 * `providers/provider-dto.mapper.ts` (Handoff 03/04).
 */
export function toBrandDto(brand: Brand): BrandDto {
  return { id: brand.id, name: brand.name, slug: brand.slug, logoUrl: brand.logoUrl, status: brand.status as unknown as BrandDto["status"] };
}

export function toCategoryDto(category: ProductCategory): ProductCategoryDto {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    status: category.status as unknown as ProductCategoryDto["status"],
  };
}

export function toVariantDto(variant: ProductVariant): ProductVariantDto {
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    title: variant.title,
    attributes: (variant.attributes as Record<string, string> | null) ?? null,
    weightValue: variant.weightValue ? Number(variant.weightValue) : null,
    weightUnit: variant.weightUnit as unknown as ProductVariantDto["weightUnit"],
    isActive: variant.isActive,
  };
}

export function toSellerSummaryDto(seller: SellerOrganization): SellerOrganizationSummaryDto {
  return {
    id: seller.id,
    name: seller.name,
    verificationStatus: seller.verificationStatus as unknown as SellerOrganizationSummaryDto["verificationStatus"],
    status: seller.status as unknown as SellerOrganizationSummaryDto["status"],
    city: seller.city,
  };
}

export function toSellerOfferDto(offer: SellerOffer & { sellerOrganization: SellerOrganization; inventoryItem: InventoryItem | null }): SellerOfferDto {
  const onHand = offer.inventoryItem?.onHand ?? 0;
  const reserved = offer.inventoryItem?.reserved ?? 0;
  return {
    id: offer.id,
    sellerOrganization: toSellerSummaryDto(offer.sellerOrganization),
    productVariantId: offer.productVariantId,
    priceAmount: offer.priceAmount,
    compareAtAmount: offer.compareAtAmount,
    currency: offer.currency,
    status: offer.status as unknown as SellerOfferDto["status"],
    availableQuantity: Math.max(0, onHand - reserved),
  };
}
