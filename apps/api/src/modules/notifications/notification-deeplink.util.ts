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
  providerBooking: (bookingId: string) => `/provider/bookings/${bookingId}`,
  provider: (providerId: string) => `/vet/${providerId}`,
  waitlist: () => `/bookings?tab=waitlist`,
  order: (orderId: string) => `/orders/${orderId}`,
  /** A failed payment is retried from the cart (there is no page at /checkout/:id). */
  cart: () => `/cart`,
  myOrders: () => `/orders`,
  travelBooking: (bookingId: string) => `/travel/bookings/${bookingId}`,
  providerTravelBooking: (bookingId: string) => `/provider/travel/bookings/${bookingId}`,
  providerTravelListing: (listingId: string) => `/provider/travel/listings/${listingId}`,
  trip: (tripId: string) => `/travel/trips/${tripId}`,
  repeatDelivery: (scheduleId: string) => `/repeat-delivery/${scheduleId}`,
  adminRefundRequests: () => `/admin/commerce/refund-requests`,
  pet: (petId: string) => `/pets/${petId}`,
  petHealth: (petId: string) => `/pets/${petId}/health`,
  sellerChannels: () => `/seller/channels`,
  sellerInventory: () => `/seller/inventory`,
  sellerOrderDetail: (orderId: string) => `/seller/orders/${orderId}`,
  sellerFinance: () => `/seller/finance`,
  sellerSettlementDetail: (settlementId: string) => `/seller/finance/settlements/${settlementId}`,
  notificationCenter: () => `/notifications`,
  lostIncident: (petId: string, incidentId: string) => `/pets/${petId}/lost/${incidentId}`,
  supportNeedManage: (listingId: string) => `/animal-support/needs/${listingId}/manage`,
  supportNeed: (listingId: string) => `/animal-support/needs/${listingId}`,
  myHelpOffers: () => `/animal-support/my-help`,
  ngoPortal: () => `/ngo`,
  ngoDonations: () => `/ngo/donations`,
  ngoVerification: () => `/ngo/verification`,
  communityPost: (postId: string) => `/community/posts/${postId}`,
  donationReceipt: (donationIntentId: string) => `/donations/${donationIntentId}`,
};
