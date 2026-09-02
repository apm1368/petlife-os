/**
 * The one deep-link construction path (spec: "do not implement brittle URL
 * strings scattered through domains"). Returns a locale-free, leading-slash
 * relative path — the frontend prefixes the active `/{locale}` segment
 * itself (see `useNotificationCenter`'s router usage), so a link built here
 * is correct regardless of which locale the recipient is viewing in when
 * they eventually open it.
 */
export const NotificationDeepLinks = {
  booking: (bookingId: string) => `/bookings/${bookingId}`,
  order: (orderId: string) => `/orders/${orderId}`,
  checkout: (checkoutId: string) => `/checkout/${checkoutId}`,
  myOrders: () => `/orders`,
  pet: (petId: string) => `/pets/${petId}`,
  petHealth: (petId: string) => `/pets/${petId}/health`,
  sellerChannels: () => `/seller/channels`,
  sellerInventory: () => `/seller/inventory`,
  sellerOrderDetail: (orderId: string) => `/seller/orders/${orderId}`,
  notificationCenter: () => `/notifications`,
};
