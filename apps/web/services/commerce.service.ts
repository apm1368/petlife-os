import type {
  CartDto,
  CheckoutDto,
  CheckoutOpsDto,
  FinancingEligibilityStatus,
  FinancingIntentDto,
  FinancingPlanOptionDto,
  DeliveryMethod,
  FulfillmentDto,
  OrderDetailDto,
  OrderSummaryDto,
  PayCheckoutResultDto,
  PaymentIntentDto,
  PaymentMethodOptionDto,
  PaginatedDto,
  PaymentProvider,
  ProductCategoryDto,
  ProductDetailDto,
  ProductReviewDto,
  ProductSearchResultDto,
  ProductSummaryDto,
  RefundDto,
  RepeatDeliveryDto,
  SellerOfferDto,
  SellerShippingOptionsDto,
  ShipmentDto,
  ShipmentTrackingDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "attr" && typeof value === "object") {
      // Structured attribute filters travel as attr[name]=value.
      for (const [name, attrValue] of Object.entries(value as Record<string, string>)) if (attrValue) search.set(`attr[${name}]`, attrValue);
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ProductSort = "RECOMMENDED" | "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "TOP_RATED";

export type SearchProductsInput = {
  category?: string;
  species?: string;
  search?: string;
  petId?: string;
  brand?: string;
  seller?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onPromotion?: boolean;
  minRating?: number;
  attr?: Record<string, string>;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
};

export type RefundRequestReason = "DAMAGED" | "WRONG_ITEM" | "NOT_AS_DESCRIBED" | "MISSING_ITEMS" | "NOT_DELIVERED" | "PET_REACTION" | "OTHER";
export const REFUND_REQUEST_REASONS: RefundRequestReason[] = ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "MISSING_ITEMS", "NOT_DELIVERED", "PET_REACTION", "OTHER"];

export const commerceService = {
  listCategories: () => apiFetch<ProductCategoryDto[]>("/shop/categories"),
  searchProducts: (input: SearchProductsInput = {}) => apiFetch<ProductSearchResultDto>(`/shop/products${toQueryString(input)}`),
  listProductReviews: (productId: string, page = 1) => apiFetch<PaginatedDto<ProductReviewDto>>(`/shop/products/${productId}/reviews${toQueryString({ page })}`),
  setFavorite: (productId: string, favorite: boolean) =>
    apiFetch<{ productId: string; favorited: boolean }>(`/shop/products/${productId}/favorite`, { method: favorite ? "PUT" : "DELETE" }),
  listFavorites: () => apiFetch<ProductSummaryDto[]>("/me/favorite-products"),
  getProductDetail: (productId: string, petId?: string) => apiFetch<ProductDetailDto>(`/shop/products/${productId}${toQueryString({ petId })}`),
  getProductOffers: (productId: string) => apiFetch<SellerOfferDto[]>(`/shop/products/${productId}/offers`),

  getCart: () => apiFetch<CartDto>("/cart"),
  addCartItem: (offerId: string, quantity: number, targetPetId?: string | null) =>
    apiFetch<CartDto>("/cart/items", { method: "POST", body: { offerId, quantity, targetPetId: targetPetId ?? undefined } }),
  updateCartItem: (lineId: string, quantity: number) => apiFetch<CartDto>(`/cart/items/${lineId}`, { method: "PATCH", body: { quantity } }),
  removeCartItem: (lineId: string) => apiFetch<CartDto>(`/cart/items/${lineId}`, { method: "DELETE" }),
  clearCart: () => apiFetch<CartDto>("/cart", { method: "DELETE" }),
  acceptCartPrices: () => apiFetch<CartDto>("/cart/accept-prices", { method: "POST" }),

  createCheckout: (input: { addressId?: string; deliveryMethod?: DeliveryMethod; acknowledgeSafetyConflict?: boolean }, idempotencyKey?: string) =>
    apiFetch<CheckoutDto>("/checkout", { method: "POST", body: input, idempotencyKey }),
  getCheckout: (id: string) => apiFetch<CheckoutDto>(`/checkout/${id}`),
  updateCheckout: (id: string, input: { addressId?: string; deliveryMethod?: DeliveryMethod }) =>
    apiFetch<CheckoutDto>(`/checkout/${id}`, { method: "PATCH", body: input }),
  createPaymentIntent: (id: string, provider?: PaymentProvider, idempotencyKey?: string) =>
    apiFetch<PaymentIntentDto>(`/checkout/${id}/payment-intent`, { method: "POST", body: { provider }, idempotencyKey }),
  pay: (id: string, mode: "SUCCESS" | "FAILURE" | "PENDING" | undefined, idempotencyKey?: string) =>
    apiFetch<PayCheckoutResultDto>(`/checkout/${id}/pay`, { method: "POST", body: { mode }, idempotencyKey }),

  getPaymentOptions: (id: string) => apiFetch<PaymentMethodOptionDto[]>(`/checkout/${id}/payment-options`),
  createFinancingIntent: (id: string, provider: PaymentProvider, idempotencyKey?: string) =>
    apiFetch<FinancingIntentDto>(`/checkout/${id}/financing-intent`, { method: "POST", body: { provider }, idempotencyKey }),
  getFinancingIntent: (id: string, financingId: string) => apiFetch<FinancingIntentDto>(`/checkout/${id}/financing-intent/${financingId}`),
  checkFinancingEligibility: (id: string, financingId: string) =>
    apiFetch<{ status: FinancingEligibilityStatus }>(`/checkout/${id}/financing-intent/${financingId}/eligibility`, { method: "POST" }),
  getFinancingPlans: (id: string, financingId: string) => apiFetch<FinancingPlanOptionDto[]>(`/checkout/${id}/financing-intent/${financingId}/plans`),
  selectFinancingPlan: (id: string, financingId: string, providerPlanId: string) =>
    apiFetch<FinancingIntentDto>(`/checkout/${id}/financing-intent/${financingId}/select-plan`, { method: "POST", body: { providerPlanId } }),
  authorizeFinancing: (id: string, financingId: string, mode: "APPROVE" | "DECLINE" | "PENDING" | undefined, idempotencyKey?: string) =>
    apiFetch<PayCheckoutResultDto>(`/checkout/${id}/financing-intent/${financingId}/authorize`, { method: "POST", body: { mode }, idempotencyKey }),
  getOpsView: (id: string) => apiFetch<CheckoutOpsDto>(`/checkout/${id}/ops`),

  getShippingOptions: (id: string) => apiFetch<SellerShippingOptionsDto[]>(`/checkout/${id}/shipping-quotes`),
  refreshShippingOptions: (id: string) => apiFetch<SellerShippingOptionsDto[]>(`/checkout/${id}/shipping-quotes/refresh`, { method: "POST" }),
  selectShippingQuote: (id: string, quoteId: string) => apiFetch<SellerShippingOptionsDto[]>(`/checkout/${id}/shipping-quotes/select`, { method: "POST", body: { quoteId } }),

  listOrders: () => apiFetch<OrderSummaryDto[]>("/orders"),
  getOrder: (id: string) => apiFetch<OrderDetailDto>(`/orders/${id}`),
  getOrderFulfillment: (orderId: string) => apiFetch<FulfillmentDto | null>(`/orders/${orderId}/fulfillment`),
  getOrderShipment: (orderId: string) => apiFetch<ShipmentDto | null>(`/orders/${orderId}/shipment`),
  getOrderTracking: (orderId: string) => apiFetch<ShipmentTrackingDto>(`/orders/${orderId}/tracking`),

  cancelOrder: (orderId: string, reason: string | undefined, idempotencyKey?: string) =>
    apiFetch<RefundDto>(`/orders/${orderId}/cancel`, { method: "POST", body: { reason }, idempotencyKey }),
  createRefundRequest: (orderId: string, input: { reason: RefundRequestReason; description?: string; orderItemIds?: string[] }, idempotencyKey?: string) =>
    apiFetch<OrderDetailDto["refundRequests"][number]>(`/orders/${orderId}/refund-requests`, { method: "POST", body: input, idempotencyKey }),
  withdrawRefundRequest: (orderId: string, requestId: string) =>
    apiFetch<OrderDetailDto["refundRequests"][number]>(`/orders/${orderId}/refund-requests/${requestId}/withdraw`, { method: "POST" }),
  reviewOrderItem: (orderId: string, itemId: string, input: { rating: number; body?: string }) =>
    apiFetch<ProductReviewDto>(`/orders/${orderId}/items/${itemId}/review`, { method: "POST", body: input }),
  listRefunds: (orderId: string) => apiFetch<RefundDto[]>(`/orders/${orderId}/refunds`),
  getRefund: (id: string) => apiFetch<RefundDto>(`/refunds/${id}`),

  listRepeatDeliveries: () => apiFetch<RepeatDeliveryDto[]>("/repeat-deliveries"),
  getRepeatDelivery: (id: string) => apiFetch<RepeatDeliveryDto>(`/repeat-deliveries/${id}`),
  createRepeatDelivery: (input: { sellerOfferId: string; quantity: number; intervalDays: number; addressId: string; firstDeliveryAt?: string }) =>
    apiFetch<RepeatDeliveryDto>("/repeat-deliveries", { method: "POST", body: input }),
  updateRepeatDelivery: (id: string, input: { quantity?: number; intervalDays?: number; addressId?: string }) =>
    apiFetch<RepeatDeliveryDto>(`/repeat-deliveries/${id}`, { method: "PATCH", body: input }),
  repeatDeliveryAction: (id: string, action: "skip" | "pause" | "resume" | "cancel" | "accept-price") =>
    apiFetch<RepeatDeliveryDto>(`/repeat-deliveries/${id}/${action}`, { method: "POST" }),
  orderRepeatCycle: (id: string) => apiFetch<CartDto>(`/repeat-deliveries/${id}/order-cycle`, { method: "POST" }),
};
