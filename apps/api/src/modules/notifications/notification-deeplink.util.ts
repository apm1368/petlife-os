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
  providerHome: () => `/provider`,
  providerTeam: () => `/provider/team`,
  /** Portal home until Codex ships a dedicated verification page (then switch to /provider/verification). */
  providerVerification: () => `/provider`,
  /** Portal home until Codex ships a dedicated verification page (then switch to /seller/verification). */
  sellerVerification: () => `/seller`,
  clinicInvitations: () => `/clinic-invitations`,
  provider: (providerId: string) => `/vet/${providerId}`,
  waitlist: () => `/bookings?tab=waitlist`,
  order: (orderId: string) => `/orders/${orderId}`,
  product: (productId: string) => `/shop/products/${productId}`,
  /** A failed payment is retried from the cart (there is no page at /checkout/:id). */
  cart: () => `/cart`,
  myOrders: () => `/orders`,
  privacy: () => `/profile/privacy`,
  travelBooking: (bookingId: string) => `/travel/bookings/${bookingId}`,
  providerTravelBooking: (bookingId: string) => `/provider/travel/bookings/${bookingId}`,
  providerTravelListing: (listingId: string) => `/provider/travel/listings/${listingId}`,
  trip: (tripId: string) => `/travel/trips/${tripId}`,
  repeatDelivery: (scheduleId: string) => `/repeat-delivery/${scheduleId}`,
  adminRefundRequests: () => `/admin/commerce/refund-requests`,
  pet: (petId: string) => `/pets/${petId}`,
  petHealth: (petId: string) => `/pets/${petId}/health`,
  petDocuments: (petId: string) => `/pets/${petId}/health/documents`,
  careItem: (petId: string, careItemId: string) => `/pets/${petId}/care/${careItemId}`,
  /** Locale-free like every other link — the notification centre adds `/{locale}` itself. */
  householdInvitation: (rawToken: string) => `/invitations/${rawToken}`,
  /**
   * A pet-ownership transfer waiting for an answer (ID-01).
   *
   * The link points at the ownership page itself, which is where the incoming
   * request is listed — there is no per-transfer page, so a link carrying the
   * transfer id would land on a 404.
   */
  petOwnershipTransfer: (_transferId: string) => `/profile/household/ownership`,
  profileHousehold: () => `/profile/household`,
  profileSecurity: () => `/profile/security`,
  membership: () => `/profile/membership`,
  sellerChannels: () => `/seller/channels`,
  sellerInventory: () => `/seller/inventory`,
  sellerOrderDetail: (orderId: string) => `/seller/orders/${orderId}`,
  sellerFinance: () => `/seller/finance`,
  sellerSettlementDetail: (settlementId: string) => `/seller/finance/settlements/${settlementId}`,
  notificationCenter: () => `/notifications`,
  lostIncident: (petId: string, incidentId: string) => `/pets/${petId}/lost/${incidentId}`,
  /** The public report page, for neighbours who are not in the household. */
  publicLostIncident: (incidentId: string) => `/lost-pets/${incidentId}`,
  supportNeedManage: (listingId: string) => `/animal-support/needs/${listingId}/manage`,
  supportNeed: (listingId: string) => `/animal-support/needs/${listingId}`,
  supportOrganization: (organizationId: string) => `/animal-support/organizations/${organizationId}`,
  myHelpOffers: () => `/animal-support/my-help`,
  chatConversation: (conversationId: string) => `/community/messages/${conversationId}`,
  ngoPortal: () => `/ngo`,
  ngoDonations: () => `/ngo/donations`,
  ngoVerification: () => `/ngo/verification`,
  communityPost: (postId: string) => `/community/posts/${postId}`,
  donationReceipt: (donationIntentId: string) => `/donations/${donationIntentId}`,
};
