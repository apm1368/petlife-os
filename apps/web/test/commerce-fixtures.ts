import type { CartDto, CartLineDto, OrderDetailDto, OrderItemDto, OrderSummaryDto, ProductDetailDto, ProductSearchResultDto, ProductSummaryDto, SellerOfferDto, SellerOrganizationSummaryDto } from "@petlife/types";

/** Batch 4 commerce DTO builders for web tests — every field the server returns, overridable per test. */
export const SELLER_A: SellerOrganizationSummaryDto = { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" };
export const SELLER_B: SellerOrganizationSummaryDto = { id: "seller-b", name: "Golestan Pet Supplies", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Karaj" };

export function offer(overrides: Partial<SellerOfferDto> = {}): SellerOfferDto {
  const priceAmount = overrides.priceAmount ?? 1_250_000;
  const unitDiscount = overrides.unitDiscount ?? 0;
  const availableQuantity = overrides.availableQuantity ?? 10;
  return {
    id: "offer-1",
    sellerOrganization: SELLER_A,
    productVariantId: "variant-1",
    priceAmount,
    compareAtAmount: null,
    currency: "IRR",
    status: "ACTIVE" as never,
    availableQuantity,
    effectiveUnitPrice: priceAmount - unitDiscount,
    unitDiscount,
    promotion: null,
    stockState: availableQuantity === 0 ? "OUT_OF_STOCK" : availableQuantity <= 5 ? "LOW_STOCK" : "IN_STOCK",
    repeatDeliveryEligible: false,
    repeatIntervalsDays: [],
    ...overrides,
  };
}

export function productSummary(overrides: Partial<ProductSummaryDto> = {}): ProductSummaryDto {
  return {
    id: "prod-1",
    title: "Royal Canin Adult Dog Food",
    slug: "royal-canin-adult-dog-food",
    brand: { id: "brand-1", name: "Royal Canin", slug: "royal-canin", logoUrl: null, status: "ACTIVE" as never },
    category: { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never },
    variantId: "variant-1",
    variantTitle: "2kg",
    bestOffer: offer(),
    compatibility: null,
    imageUrl: null,
    stockState: "IN_STOCK",
    rating: { average: null, count: 0 },
    supportsDog: true,
    supportsCat: false,
    ...overrides,
  };
}

export function searchResult(items: ProductSummaryDto[], overrides: Partial<ProductSearchResultDto> = {}): ProductSearchResultDto {
  return { items, total: items.length, page: 1, pageSize: 24, facets: { brands: [], sellers: [], attributes: [], priceRange: null }, ...overrides };
}

export function productDetail(overrides: Partial<ProductDetailDto> = {}): ProductDetailDto {
  return {
    id: "prod-1",
    title: "Royal Canin Adult Dog Food",
    slug: "royal-canin-adult-dog-food",
    description: "Complete nutrition for adult dogs.",
    brand: { id: "brand-1", name: "Royal Canin", slug: "royal-canin", logoUrl: null, status: "ACTIVE" as never },
    category: { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never },
    status: "ACTIVE" as never,
    variants: [],
    offers: [],
    compatibility: null,
    media: [],
    specifications: [],
    defaultOfferId: null,
    rating: { average: null, count: 0 },
    reviews: [],
    related: [],
    favorited: false,
    supportsDog: true,
    supportsCat: false,
    minAgeMonths: null,
    maxAgeMonths: null,
    minWeightKg: null,
    maxWeightKg: null,
    ...overrides,
  };
}

export function cartLine(overrides: Partial<CartLineDto> = {}): CartLineDto {
  const quantity = overrides.quantity ?? 1;
  const currentPriceAmount = overrides.currentPriceAmount ?? 1_250_000;
  return {
    id: "line-1",
    sellerOffer: offer(),
    productId: "prod-1",
    productTitle: "Royal Canin Adult Dog Food",
    variantTitle: "2kg",
    variantSku: "RC-DOG-2KG",
    targetPetId: null,
    targetPetName: null,
    quantity,
    unitPriceSnapshot: currentPriceAmount,
    currentPriceAmount,
    priceChanged: false,
    currency: "IRR",
    lineTotal: currentPriceAmount * quantity,
    compatibility: null,
    listUnitPrice: currentPriceAmount,
    unitDiscount: 0,
    promotionName: null,
    promotionId: null,
    issues: [],
    ...overrides,
  };
}

export function cart(lines: CartLineDto[], overrides: Partial<CartDto> = {}): CartDto {
  const subtotalAmount = lines.reduce((s, l) => s + l.lineTotal, 0);
  return {
    id: "cart-1",
    status: "ACTIVE" as never,
    sellerGroups: lines.length ? [{ sellerOrganization: SELLER_A, lines, subtotalAmount }] : [],
    totalItems: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalAmount,
    currency: "IRR",
    hasSafetyConflict: false,
    discountAmount: lines.reduce((s, l) => s + l.unitDiscount * l.quantity, 0),
    hasBlockingIssues: false,
    ...overrides,
  };
}

export function orderItem(overrides: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    id: "item-1",
    productId: "prod-1",
    productVariantId: "variant-1",
    productTitleSnapshot: "Royal Canin Adult Dog Food",
    variantTitleSnapshot: "2kg",
    skuSnapshot: "RC-DOG-2KG",
    quantity: 1,
    unitPrice: 1_250_000,
    totalPrice: 1_250_000,
    targetPetId: null,
    compatibilitySnapshot: null,
    listUnitPrice: 1_250_000,
    unitDiscount: 0,
    promotionName: null,
    reviewId: null,
    ...overrides,
  };
}

export function orderSummary(overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: "order-1",
    checkoutId: "checkout-1",
    sellerOrganization: SELLER_A,
    status: "CONFIRMED" as never,
    paymentStatus: "CAPTURED" as never,
    financingStatus: null,
    refundStatus: null,
    fulfillmentStatus: null,
    itemCount: 1,
    totalAmount: 1_250_000,
    currency: "IRR",
    createdAt: "2026-09-20T10:00:00.000Z",
    confirmedAt: "2026-09-20T10:00:05.000Z",
    orderNumber: "PL-1A2B3C4D",
    cancelledAt: null,
    previewTitles: ["Royal Canin Adult Dog Food"],
    ...overrides,
  };
}

export function orderDetail(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    id: "order-1",
    checkoutId: "checkout-1",
    sellerOrganization: SELLER_A,
    status: "CONFIRMED" as never,
    paymentStatus: "CAPTURED" as never,
    financingStatus: null,
    refunds: [],
    fulfillment: null,
    subtotalAmount: 1_250_000,
    deliveryAmount: 0,
    discountAmount: 0,
    totalAmount: 1_250_000,
    currency: "IRR",
    shippingAddress: null,
    items: [orderItem()],
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    confirmedAt: "2026-09-20T10:00:05.000Z",
    orderNumber: "PL-1A2B3C4D",
    cancelledAt: null,
    cancelReason: null,
    timeline: [{ toStatus: "CONFIRMED", fromStatus: null, actorType: "SYSTEM", reason: "PAYMENT_CONFIRMED", createdAt: "2026-09-20T10:00:05.000Z" }],
    refundRequests: [],
    canCancel: false,
    canRequestRefund: false,
    ...overrides,
  };
}
