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
  PaymentProvider,
  ProductCategoryDto,
  ProductDetailDto,
  ProductSummaryDto,
  RefundDto,
  SellerOfferDto,
  SellerShippingOptionsDto,
  ShipmentDto,
  ShipmentTrackingDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type SearchProductsInput = {
  category?: string;
  species?: string;
  search?: string;
  petId?: string;
};

export const commerceService = {
  listCategories: () => apiFetch<ProductCategoryDto[]>("/shop/categories"),
  searchProducts: (input: SearchProductsInput = {}) => apiFetch<ProductSummaryDto[]>(`/shop/products${toQueryString(input)}`),
  getProductDetail: (productId: string, petId?: string) => apiFetch<ProductDetailDto>(`/shop/products/${productId}${toQueryString({ petId })}`),
  getProductOffers: (productId: string) => apiFetch<SellerOfferDto[]>(`/shop/products/${productId}/offers`),

  getCart: () => apiFetch<CartDto>("/cart"),
  addCartItem: (offerId: string, quantity: number, targetPetId?: string | null) =>
    apiFetch<CartDto>("/cart/items", { method: "POST", body: { offerId, quantity, targetPetId: targetPetId ?? undefined } }),
  updateCartItem: (lineId: string, quantity: number) => apiFetch<CartDto>(`/cart/items/${lineId}`, { method: "PATCH", body: { quantity } }),
  removeCartItem: (lineId: string) => apiFetch<CartDto>(`/cart/items/${lineId}`, { method: "DELETE" }),
  clearCart: () => apiFetch<CartDto>("/cart", { method: "DELETE" }),

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

  requestRefund: (orderId: string, reason?: string, amount?: number, idempotencyKey?: string) =>
    apiFetch<RefundDto>(`/orders/${orderId}/refunds`, { method: "POST", body: { reason, amount }, idempotencyKey }),
  listRefunds: (orderId: string) => apiFetch<RefundDto[]>(`/orders/${orderId}/refunds`),
  getRefund: (id: string) => apiFetch<RefundDto>(`/refunds/${id}`),
};
