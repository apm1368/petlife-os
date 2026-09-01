import type {
  CartDto,
  CheckoutDto,
  DeliveryMethod,
  OrderDetailDto,
  OrderSummaryDto,
  PayCheckoutResultDto,
  PaymentIntentDto,
  ProductCategoryDto,
  ProductDetailDto,
  ProductSummaryDto,
  SellerOfferDto,
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
  createPaymentIntent: (id: string, idempotencyKey?: string) =>
    apiFetch<PaymentIntentDto>(`/checkout/${id}/payment-intent`, { method: "POST", idempotencyKey }),
  pay: (id: string, mode: "SUCCESS" | "FAILURE" | "PENDING" | undefined, idempotencyKey?: string) =>
    apiFetch<PayCheckoutResultDto>(`/checkout/${id}/pay`, { method: "POST", body: { mode }, idempotencyKey }),

  listOrders: () => apiFetch<OrderSummaryDto[]>("/orders"),
  getOrder: (id: string) => apiFetch<OrderDetailDto>(`/orders/${id}`),
};
