import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * All domain errors thrown across modules should be an ApiException so the
 * global filter can always emit the { error: { code, message, ... } } shape.
 */
export class ApiException extends HttpException {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST, details?: Record<string, unknown>) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}

export class PetAccessDeniedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PET_ACCESS_DENIED", "You do not have access to this pet.", HttpStatus.FORBIDDEN, details);
  }
}

export class HouseholdAccessDeniedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("HOUSEHOLD_ACCESS_DENIED", "You do not have access to this household.", HttpStatus.FORBIDDEN, details);
  }
}

export class NotFoundApiException extends ApiException {
  constructor(resource: string, details?: Record<string, unknown>) {
    super("NOT_FOUND", `${resource} not found.`, HttpStatus.NOT_FOUND, details);
  }
}

export class UnauthenticatedException extends ApiException {
  constructor() {
    super("UNAUTHENTICATED", "You must be signed in to perform this action.", HttpStatus.UNAUTHORIZED);
  }
}

export class OtpInvalidException extends ApiException {
  constructor() {
    super("OTP_INVALID", "The code you entered is incorrect or has expired.", HttpStatus.BAD_REQUEST);
  }
}

export class OtpRateLimitedException extends ApiException {
  constructor(retryAfterSeconds: number) {
    super("OTP_RATE_LIMITED", "Too many attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, {
      retryAfterSeconds,
    });
  }
}

export class ValidationApiException extends ApiException {
  constructor(details: Record<string, unknown>) {
    super("VALIDATION_ERROR", "The request did not pass validation.", HttpStatus.BAD_REQUEST, details);
  }
}

// ---------------------------------------------------------------------------
// Vet Booking (Handoff 03)
// ---------------------------------------------------------------------------

export class SlotUnavailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SLOT_UNAVAILABLE", "That time is no longer available. Please choose another slot.", HttpStatus.CONFLICT, details);
  }
}

export class HoldExpiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("HOLD_EXPIRED", "This hold has expired. Please choose a slot again.", HttpStatus.GONE, details);
  }
}

export class BookingConflictException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("BOOKING_CONFLICT", "This slot was just booked by someone else. Please choose another slot.", HttpStatus.CONFLICT, details);
  }
}

export class ProviderNotVerifiedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PROVIDER_NOT_VERIFIED", "This provider is not yet verified.", HttpStatus.BAD_REQUEST, details);
  }
}

export class ServiceNotAvailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SERVICE_NOT_AVAILABLE", "This service is not currently available.", HttpStatus.BAD_REQUEST, details);
  }
}

export class PetNotSupportedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PET_NOT_SUPPORTED", "This provider does not support this pet's species for the selected service.", HttpStatus.BAD_REQUEST, details);
  }
}

export class BookingNotCancellableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("BOOKING_NOT_CANCELLABLE", "This booking can no longer be cancelled.", HttpStatus.BAD_REQUEST, details);
  }
}

// ---------------------------------------------------------------------------
// Services Marketplace Basics (Handoff 04)
// ---------------------------------------------------------------------------

export class AddressRequiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADDRESS_REQUIRED", "This service needs an address before it can be booked.", HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Thrown only when a service's required Care Profile/Health Basics context
 * is entirely NOT_STARTED — a PARTIAL profile is allowed through (surfaced
 * instead as PetCompatibilityStatus.NEEDS_REVIEW, an advisory, not a block).
 * See PetServiceCompatibilityService and BookingsService.confirm().
 */
export class PetContextIncompleteException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PET_CONTEXT_INCOMPLETE", "This pet's profile needs more information before this service can be booked.", HttpStatus.BAD_REQUEST, details);
  }
}

// ---------------------------------------------------------------------------
// Minimal Provider OS (Handoff 05)
// ---------------------------------------------------------------------------

/**
 * Covers every "not allowed to operate here" case: no ProviderUser
 * membership at all, an ambiguous multi-org context with no explicit choice
 * (details.reason = "AMBIGUOUS_CONTEXT"), a role too low for the action, or a
 * booking/resource that belongs to a different provider organization
 * (details.reason = "CROSS_ORGANIZATION") — deliberately 403, not 404, since
 * these are legitimate authenticated provider users, just the wrong scope.
 */
export class ProviderAccessDeniedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PROVIDER_ACCESS_DENIED", "You do not have access to this provider resource.", HttpStatus.FORBIDDEN, details);
  }
}

export class ProviderOrgNotVerifiedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PROVIDER_NOT_VERIFIED", "Your organization must be verified before taking this action.", HttpStatus.FORBIDDEN, details);
  }
}

export class BookingNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("BOOKING_NOT_FOUND", "Booking not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class InvalidBookingTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_BOOKING_TRANSITION", "This booking cannot move to that state right now.", HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Never thrown to silently cancel or move a booking — it is the explicit
 * "3 confirmed bookings exist in this blocked period" gate (spec section 9);
 * passing acknowledgeConflict: true on the same request proceeds anyway.
 */
export class AvailabilityConflictException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("AVAILABILITY_CONFLICT", "This change conflicts with existing confirmed bookings.", HttpStatus.CONFLICT, details);
  }
}

export class ServiceHasFutureBookingsException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SERVICE_HAS_FUTURE_BOOKINGS", "This change is not allowed while future bookings exist for this service.", HttpStatus.CONFLICT, details);
  }
}

/**
 * Part of the vocabulary for a booking-linked PetAccessGrant that has
 * lapsed — kept distinct from ProviderAccessDeniedException since this is
 * about pet-data authorization, not provider-operational authorization (see
 * the doc comment on ProviderUserRole). Not yet thrown by any endpoint this
 * phase: ProviderBookingDetailDto.access.state = "EXPIRED" already surfaces
 * this as a graceful 200 UI state rather than a page-level error — see
 * README Known limitations.
 */
export class AccessExpiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ACCESS_EXPIRED", "This access has expired.", HttpStatus.FORBIDDEN, details);
  }
}

// ---------------------------------------------------------------------------
// Commerce Core (Handoff 06)
// ---------------------------------------------------------------------------

export class ProductNotAvailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PRODUCT_NOT_AVAILABLE", "This product is not currently available.", HttpStatus.BAD_REQUEST, details);
  }
}

export class OfferNotAvailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("OFFER_NOT_AVAILABLE", "This offer is not currently available.", HttpStatus.BAD_REQUEST, details);
  }
}

export class SellerNotAvailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_NOT_AVAILABLE", "This seller is not currently verified/active.", HttpStatus.BAD_REQUEST, details);
  }
}

export class InsufficientInventoryException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INSUFFICIENT_INVENTORY", "There isn't enough stock available for this quantity.", HttpStatus.CONFLICT, details);
  }
}

export class PriceChangedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PRICE_CHANGED", "This item's price has changed since it was added to your cart.", HttpStatus.CONFLICT, details);
  }
}

/**
 * Not a hard block — surfaced so the caller can re-review before proceeding
 * (spec section 23: "prefer explicit acknowledgement, unless product
 * metadata marks hard block"). Checkout creation returns this in
 * `validationIssues`, not as a thrown exception, for NEEDS_REVIEW/
 * NOT_RECOMMENDED; see SAFETY_CONFLICT below for the one status this phase
 * treats as a hard block.
 */
export class CompatibilityReviewRequiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("COMPATIBILITY_REVIEW_REQUIRED", "This item needs your review before it can be purchased for this pet.", HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * POTENTIAL_SAFETY_CONFLICT must outrank any commerce incentive (spec
 * section 13) — thrown only when a checkout is created/paid without the
 * required explicit acknowledgement for a line the compatibility engine
 * flagged as a safety conflict.
 */
export class SafetyConflictException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SAFETY_CONFLICT", "This item may not be safe for this pet. Please review before continuing.", HttpStatus.BAD_REQUEST, details);
  }
}

export class CartEmptyException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CART_EMPTY", "Your cart is empty.", HttpStatus.BAD_REQUEST, details);
  }
}

export class CheckoutExpiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CHECKOUT_EXPIRED", "This checkout has expired. Please start again.", HttpStatus.GONE, details);
  }
}

export class PaymentFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_FAILED", "Payment was not completed.", HttpStatus.BAD_REQUEST, details);
  }
}

export class PaymentPendingException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_PENDING", "Payment is still being confirmed.", HttpStatus.ACCEPTED, details);
  }
}

export class PaymentAlreadyCompletedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_ALREADY_COMPLETED", "This checkout has already been paid.", HttpStatus.CONFLICT, details);
  }
}

export class OrderNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ORDER_NOT_FOUND", "Order not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class CheckoutNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CHECKOUT_NOT_FOUND", "Checkout not found.", HttpStatus.NOT_FOUND, details);
  }
}

// ---------------------------------------------------------------------------
// Real Payments + BNPL + Refund Basics + Reconciliation (Handoff 07)
// ---------------------------------------------------------------------------

export class PaymentProviderUnavailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_PROVIDER_UNAVAILABLE", "This payment provider is not currently available.", HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}

export class PaymentAuthorizationFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_AUTHORIZATION_FAILED", "The payment provider declined this authorization.", HttpStatus.BAD_REQUEST, details);
  }
}

/** Distinct from PaymentPendingException below — this one means the provider's own status query came back neither terminal nor pending in any recognizable way (spec section 28: "UNKNOWN must remain explicit"). */
export class PaymentStateUnknownException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_STATE_UNKNOWN", "The payment provider's current status could not be determined.", HttpStatus.CONFLICT, details);
  }
}

export class FinancingNotAvailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FINANCING_NOT_AVAILABLE", "Installment payment is not available for this provider or amount.", HttpStatus.BAD_REQUEST, details);
  }
}

export class FinancingNotEligibleException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FINANCING_NOT_ELIGIBLE", "This checkout is not eligible for installment payment.", HttpStatus.BAD_REQUEST, details);
  }
}

export class FinancingDeclinedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FINANCING_DECLINED", "The installment provider declined this request.", HttpStatus.BAD_REQUEST, details);
  }
}

export class FinancingExpiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FINANCING_EXPIRED", "This installment request has expired.", HttpStatus.GONE, details);
  }
}

export class InvalidFinancingPlanException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_FINANCING_PLAN", "The selected installment plan is not valid for this request.", HttpStatus.BAD_REQUEST, details);
  }
}

export class WebhookSignatureInvalidException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("WEBHOOK_SIGNATURE_INVALID", "The webhook signature could not be verified.", HttpStatus.BAD_REQUEST, details);
  }
}

export class RefundNotSupportedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("REFUND_NOT_SUPPORTED", "This refund is not supported by the provider.", HttpStatus.BAD_REQUEST, details);
  }
}

export class RefundFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("REFUND_FAILED", "The refund could not be completed.", HttpStatus.BAD_REQUEST, details);
  }
}

export class InventoryChangedAfterPaymentException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVENTORY_CHANGED_AFTER_PAYMENT", "Inventory changed after payment and could not be safely confirmed.", HttpStatus.CONFLICT, details);
  }
}

/** Never thrown as a request-blocking error this phase — surfaced only as Checkout.PAYMENT_SUCCEEDED_ORDER_ISSUE in the response body (spec section 21) so the caller never sees a bare 4xx for money that already moved. Kept here for API completeness/documentation. */
export class PaymentOrderConfirmationIssueException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PAYMENT_ORDER_CONFIRMATION_ISSUE", "Payment succeeded but the order could not be confirmed automatically.", HttpStatus.CONFLICT, details);
  }
}

export class FinancingIntentNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FINANCING_INTENT_NOT_FOUND", "Financing intent not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class RefundNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("REFUND_NOT_FOUND", "Refund not found.", HttpStatus.NOT_FOUND, details);
  }
}

// ---------------------------------------------------------------------------
// Delivery & Logistics Core (Handoff 08)
// ---------------------------------------------------------------------------

export class ShippingProviderUnavailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_PROVIDER_UNAVAILABLE", "This delivery provider is currently unavailable.", HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}

export class ShippingProviderDisabledException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_PROVIDER_DISABLED", "This delivery provider is not enabled.", HttpStatus.BAD_REQUEST, details);
  }
}

export class ShippingQuoteNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_QUOTE_NOT_FOUND", "Shipping quote not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class ShippingQuoteExpiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_QUOTE_EXPIRED", "This shipping quote has expired. Please refresh and choose again.", HttpStatus.GONE, details);
  }
}

export class ShippingQuoteNotEligibleException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_QUOTE_NOT_ELIGIBLE", "This shipping quote does not belong to the given order/checkout.", HttpStatus.BAD_REQUEST, details);
  }
}

/** Never thrown for a re-selection of the already-selected quote (spec section 21: "duplicate quote selection must be safe/idempotent") — only for selecting a *different* quote while checkout has moved past the shipping step. */
export class ShippingQuoteAlreadySelectedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_QUOTE_ALREADY_SELECTED", "A different shipping option has already been selected and locked in.", HttpStatus.CONFLICT, details);
  }
}

export class FulfillmentNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FULFILLMENT_NOT_FOUND", "Fulfillment not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class FulfillmentInvalidTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("FULFILLMENT_INVALID_TRANSITION", "This fulfillment cannot move to the requested state from its current state.", HttpStatus.CONFLICT, details);
  }
}

export class ShipmentNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_NOT_FOUND", "Shipment not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class ShipmentAlreadyExistsException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_ALREADY_EXISTS", "A shipment already exists for this fulfillment.", HttpStatus.CONFLICT, details);
  }
}

export class ShipmentCreationFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_CREATION_FAILED", "The delivery provider could not create this shipment.", HttpStatus.BAD_GATEWAY, details);
  }
}

export class ShipmentCancelNotAllowedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_CANCEL_NOT_ALLOWED", "This shipment can no longer be canceled.", HttpStatus.CONFLICT, details);
  }
}

/** Explicit, never silently treated as success (spec section 6/28: "UNKNOWN must never imply success"). */
export class ShipmentProviderStatusUnknownException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_PROVIDER_STATUS_UNKNOWN", "The delivery provider returned an unrecognized status.", HttpStatus.CONFLICT, details);
  }
}

export class ShipmentReconciliationFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPMENT_RECONCILIATION_FAILED", "Reconciliation with the delivery provider failed.", HttpStatus.BAD_GATEWAY, details);
  }
}

export class ShippingWebhookInvalidException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SHIPPING_WEBHOOK_INVALID", "The shipping webhook payload could not be verified.", HttpStatus.BAD_REQUEST, details);
  }
}

// ---------------------------------------------------------------------------
// Seller OS + Marketplace Channel Integrations (Handoff 09)
// ---------------------------------------------------------------------------

/** Mirrors ProviderAccessDeniedException — `details.reason` distinguishes NOT_A_SELLER / AMBIGUOUS_CONTEXT / CROSS_ORGANIZATION / INSUFFICIENT_ROLE / SELLER_SUSPENDED. */
export class SellerAccessDeniedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_ACCESS_DENIED", "You do not have access to this seller organization.", HttpStatus.FORBIDDEN, details);
  }
}

export class SellerOrganizationNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_ORGANIZATION_NOT_FOUND", "Seller organization not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class SellerMembershipNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_MEMBERSHIP_NOT_FOUND", "Seller team member not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Spec section 48: "prevent removal of the last active OWNER". */
export class SellerLastOwnerException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_LAST_OWNER", "A seller organization must always have at least one active owner.", HttpStatus.CONFLICT, details);
  }
}

export class InventoryMovementInvalidException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVENTORY_MOVEMENT_INVALID", "This inventory adjustment would make stock negative.", HttpStatus.CONFLICT, details);
  }
}

export class MarketplaceProviderUnavailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_PROVIDER_UNAVAILABLE", "This marketplace provider is not available.", HttpStatus.BAD_GATEWAY, details);
  }
}

export class MarketplaceProviderDisabledException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_PROVIDER_DISABLED", "This marketplace provider is disabled.", HttpStatus.BAD_REQUEST, details);
  }
}

export class MarketplaceChannelAccountNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_CHANNEL_ACCOUNT_NOT_FOUND", "Marketplace channel account not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MarketplaceListingNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_LISTING_NOT_FOUND", "Marketplace listing not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Spec section 46 error-UX example verbatim: "Listing mapping required". */
export class MarketplaceListingMappingRequiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_LISTING_MAPPING_REQUIRED", "This offer must be mapped to a marketplace listing before it can be synced.", HttpStatus.BAD_REQUEST, details);
  }
}

export class MarketplaceListingCapabilityUnsupportedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_CAPABILITY_UNSUPPORTED", "This marketplace provider does not support this operation.", HttpStatus.BAD_REQUEST, details);
  }
}

export class MarketplaceSyncFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_SYNC_FAILED", "The marketplace provider could not complete this operation.", HttpStatus.BAD_GATEWAY, details);
  }
}

export class MarketplaceOrderNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_ORDER_NOT_FOUND", "Marketplace order not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MarketplaceOrderIngestionFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_ORDER_INGESTION_FAILED", "This marketplace order could not be processed.", HttpStatus.CONFLICT, details);
  }
}

/** Mirrors ShippingWebhookInvalidException — never mutates state on an unverified payload. */
export class MarketplaceWebhookInvalidException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_WEBHOOK_INVALID", "The marketplace webhook payload could not be verified.", HttpStatus.BAD_REQUEST, details);
  }
}

/** Handoff 10 — a notification not found, or found but not owned by the caller (never a silent 404 that also leaks existence, but never a different notification's content either). */
export class NotificationNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("NOTIFICATION_NOT_FOUND", "Notification not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MessagingProviderUnavailableException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MESSAGING_PROVIDER_UNAVAILABLE", "This messaging provider is not available.", HttpStatus.BAD_GATEWAY, details);
  }
}

export class MessagingProviderDisabledException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MESSAGING_PROVIDER_DISABLED", "This messaging provider is disabled.", HttpStatus.BAD_REQUEST, details);
  }
}

/** Faraz (or any future real SMS provider) rejected the send outright — mirrors PaymentAuthorizationFailedException's own "the attempt itself failed, not a transport error" distinction. */
export class MessagingSendFailedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MESSAGING_SEND_FAILED", "The message could not be sent.", HttpStatus.BAD_GATEWAY, details);
  }
}

/** Thrown by a real (non-DEV) adapter's production-path methods when MESSAGING_SANDBOX_MODE=production is set without real credentials configured — never a silent fallback to simulation. */
export class MessagingProviderNotConfiguredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MESSAGING_PROVIDER_NOT_CONFIGURED", "This messaging provider is not configured for production use.", HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}

export class InvalidPhoneNumberException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_PHONE_NUMBER", "This phone number could not be normalized.", HttpStatus.BAD_REQUEST, details);
  }
}

/** Mirrors ShippingWebhookInvalidException/MarketplaceWebhookInvalidException — never mutates state on an unverified payload. */
export class MessagingWebhookInvalidException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MESSAGING_WEBHOOK_INVALID", "The messaging webhook payload could not be verified.", HttpStatus.BAD_REQUEST, details);
  }
}

// ---------------------------------------------------------------------------
// Admin CRM + Support + Disputes + Trust Operations (Handoff 11)
// ---------------------------------------------------------------------------

/**
 * Mirrors ProviderAccessDeniedException/SellerAccessDeniedException —
 * `details.reason` distinguishes NOT_AN_ADMIN / ADMIN_SUSPENDED /
 * INSUFFICIENT_PERMISSION. Thrown for any /admin route when the caller's
 * session does not resolve to an ACTIVE AdminUser row with the required
 * permission — a consumer session alone never satisfies this (spec: "no
 * implicit access through normal user session alone").
 */
export class AdminAccessDeniedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_ACCESS_DENIED", "You do not have access to this admin operation.", HttpStatus.FORBIDDEN, details);
  }
}

export class AdminUserNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_USER_NOT_FOUND", "Admin user not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** A customer (User) looked up by an admin route — distinct from AdminUserNotFoundException, which is about the internal-platform identity, not a consumer. */
export class AdminCustomerNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_CUSTOMER_NOT_FOUND", "Customer not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class SupportCaseNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SUPPORT_CASE_NOT_FOUND", "Support case not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown by the centralized support-case transition validator — spec: "no arbitrary status PATCH". */
export class InvalidSupportCaseTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_SUPPORT_CASE_TRANSITION", "This support case status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

/** A user tried to reopen a case that isn't RESOLVED/CLOSED — reopen is a narrower, user-triggered action than the admin transition map allows. */
export class InvalidSupportCaseReopenException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_SUPPORT_CASE_REOPEN", "This support case cannot be reopened right now.", HttpStatus.CONFLICT, details);
  }
}

/** A user-created support case referenced a household/pet/order/booking they don't have access to — IDOR guard, deliberately generic rather than per-entity to avoid leaking which kind of reference failed. */
export class SupportCaseInvalidReferenceException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SUPPORT_CASE_INVALID_REFERENCE", "That item could not be linked to your support case.", HttpStatus.BAD_REQUEST, details);
  }
}

export class AdminTaskNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_TASK_NOT_FOUND", "Task not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class DisputeNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("DISPUTE_NOT_FOUND", "Dispute not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown by the centralized dispute transition validator — also the mechanism that makes concurrent-resolution races safe (see DisputeService.transition()'s optimistic status-guarded update). */
export class InvalidDisputeTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_DISPUTE_TRANSITION", "This dispute status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

export class TrustCaseNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("TRUST_CASE_NOT_FOUND", "Trust case not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class InvalidTrustCaseTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_TRUST_CASE_TRANSITION", "This trust case status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

export class AppealNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("APPEAL_NOT_FOUND", "Appeal not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class TrustActionNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("TRUST_ACTION_NOT_FOUND", "Trust action not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Appeal.trustActionId is @unique — one appeal per action (spec gives no provision for repeated appeals of the same action this phase). */
export class AppealAlreadyExistsException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("APPEAL_ALREADY_EXISTS", "An appeal already exists for this trust action.", HttpStatus.CONFLICT, details);
  }
}

/** Used only by admin-facing lookups (e.g. verification-status overrides) — consumer-facing provider routes have their own not-found handling. */
export class ProviderOrganizationNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PROVIDER_ORGANIZATION_NOT_FOUND", "Provider organization not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class AdminRefundApprovalNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_REFUND_APPROVAL_NOT_FOUND", "Refund approval not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class InvalidAdminRefundApprovalTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_ADMIN_REFUND_APPROVAL_TRANSITION", "This refund approval status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

/** Two-person control (spec: "a *different* admin than the requester must APPROVE") — never bypassable, including by a SUPER_ADMIN. */
export class AdminRefundSelfApprovalException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_REFUND_SELF_APPROVAL", "A refund approval must be approved by a different admin than the requester.", HttpStatus.CONFLICT, details);
  }
}

/** Thrown when a request tries to jump straight to EXECUTED for an amount at/above ADMIN_REFUND_APPROVAL_THRESHOLD_IRR without a prior APPROVED transition by a different admin. */
export class AdminRefundApprovalRequiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ADMIN_REFUND_APPROVAL_REQUIRED", "This refund amount requires a second admin's approval before it can be executed.", HttpStatus.CONFLICT, details);
  }
}

/// Authentication (Handoff 12) — Google OAuth, username/password.

/** Deliberately identical message/code whether the username doesn't exist or the password is wrong — never lets a caller distinguish the two (enumeration resistance). */
export class InvalidCredentialsException extends ApiException {
  constructor() {
    super("INVALID_CREDENTIALS", "The username or password you entered is incorrect.", HttpStatus.UNAUTHORIZED);
  }
}

export class UsernameTakenException extends ApiException {
  constructor() {
    super("USERNAME_TAKEN", "This username is already taken.", HttpStatus.CONFLICT);
  }
}

/** class-validator already rejects an obviously-too-short password at the DTO layer; this is for the rarer case a caller bypasses that (e.g. a future non-HTTP caller). */
export class WeakPasswordException extends ApiException {
  constructor() {
    super("WEAK_PASSWORD", "Password must be at least 8 characters.", HttpStatus.BAD_REQUEST);
  }
}

export class CurrentPasswordIncorrectException extends ApiException {
  constructor() {
    super("CURRENT_PASSWORD_INCORRECT", "Your current password is incorrect.", HttpStatus.BAD_REQUEST);
  }
}

/** Thrown when GOOGLE_AUTH_ENABLED is false (or credentials are unset) — never a silent fake login. */
export class GoogleAuthDisabledException extends ApiException {
  constructor() {
    super("GOOGLE_AUTH_DISABLED", "Google sign-in is not available right now.", HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/** Covers every real-flow failure mode: missing/mismatched state cookie, expired handshake, and (for the callback) a rejected/unverifiable id_token — deliberately one generic code so a caller can't probe which check failed. */
export class GoogleAuthFailedException extends ApiException {
  constructor() {
    super("GOOGLE_AUTH_FAILED", "We couldn't complete Google sign-in. Please try again.", HttpStatus.BAD_REQUEST);
  }
}

/** A verified Google/consumer identity that already resolves to a *different* existing User than the one implied by the request — never silently merged. */
export class AccountLinkingConflictException extends ApiException {
  constructor() {
    super("ACCOUNT_LINKING_CONFLICT", "This account is already linked to a different sign-in method.", HttpStatus.CONFLICT);
  }
}

/** Deliberately generic and only used for the token-*consumption* step (reset submission) — the token-*request* step (forgot-password) never reveals whether the identifier matched anything. */
export class PasswordResetTokenInvalidException extends ApiException {
  constructor() {
    super("PASSWORD_RESET_TOKEN_INVALID", "This password reset link is invalid or has expired.", HttpStatus.BAD_REQUEST);
  }
}

/** returnTo must be an internal, same-origin relative path — anything else (a full URL, protocol-relative //host, or a path escaping the app) is rejected rather than silently downgraded to "/", so a caller integrating against this API notices immediately. */
export class InvalidReturnToException extends ApiException {
  constructor() {
    super("INVALID_RETURN_TO", "The returnTo destination is not a valid internal path.", HttpStatus.BAD_REQUEST);
  }
}

/// Marketplace & Seller Financial Settlement (Handoff 14)

export class SellerFinancialAccountNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_FINANCIAL_ACCOUNT_NOT_FOUND", "Seller financial account not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown by CommissionRuleService if no rule at all resolves — should be unreachable once the platform default seed row exists, but never silently defaults to 0%. */
export class CommissionRuleNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("COMMISSION_RULE_NOT_FOUND", "No effective commission rule could be resolved for this order.", HttpStatus.CONFLICT, details);
  }
}

/** Guards SellerFinanceService.attributeOrderEconomics — an Order can only ever be attributed once (its OrderFinancialBreakdown's own existence is the idempotency check). */
export class OrderAlreadyAttributedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ORDER_ALREADY_ATTRIBUTED", "This order's financial economics have already been attributed.", HttpStatus.CONFLICT, details);
  }
}

/** A computed platform commission came out negative — an order-level discount exceeded the recoverable commission, a documented unhandled edge case (see README "Commission model") rather than a silently wrong ledger posting. */
export class NegativePlatformRevenueException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("NEGATIVE_PLATFORM_REVENUE", "This order's discount exceeds the commission that would normally fund it — not supported this phase.", HttpStatus.CONFLICT, details);
  }
}

export class SellerSettlementNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_SETTLEMENT_NOT_FOUND", "Settlement not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown by the centralized settlement transition validator — no arbitrary status PATCH, mirroring InvalidSupportCaseTransitionException's own precedent. */
export class InvalidSellerSettlementTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_SELLER_SETTLEMENT_TRANSITION", "This settlement status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

/** Two-person control (spec: "creator/initiator should not approve their own payout") — mirrors AdminRefundSelfApprovalException exactly. */
export class SellerSettlementSelfApprovalException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_SETTLEMENT_SELF_APPROVAL", "A settlement must be approved by a different admin than the one who calculated it.", HttpStatus.CONFLICT, details);
  }
}

/** Thrown when payout is attempted on a settlement at/above SETTLEMENT_APPROVAL_THRESHOLD_IRR without a prior APPROVED transition by a different admin — mirrors AdminRefundApprovalRequiredException exactly. */
export class SellerSettlementApprovalRequiredException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_SETTLEMENT_APPROVAL_REQUIRED", "This settlement amount requires a second admin's approval before payout.", HttpStatus.CONFLICT, details);
  }
}

export class SellerAdjustmentNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("SELLER_ADJUSTMENT_NOT_FOUND", "Seller adjustment not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MarketplaceSettlementStatementNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_SETTLEMENT_STATEMENT_NOT_FOUND", "Marketplace settlement statement not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MarketplaceReconciliationResultNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_RECONCILIATION_RESULT_NOT_FOUND", "Reconciliation result not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** A reconciliation result already marked resolved cannot be resolved again with different data — a reopened finding is a new row, never an edited one (append-only discipline, matching the ledger's own). */
export class MarketplaceReconciliationAlreadyResolvedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MARKETPLACE_RECONCILIATION_ALREADY_RESOLVED", "This reconciliation finding has already been resolved.", HttpStatus.CONFLICT, details);
  }
}

export class ArticleNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ARTICLE_NOT_FOUND", "Article not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown for both "no ArticleLocale row exists for this locale yet" and (on the public read path) "this locale isn't publicly visible" — the public path never distinguishes the two, so an unpublished draft's existence is never leaked (mirrors SupportCase's own "404 for both not-found and not-yours" precedent). */
export class ArticleLocaleNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("ARTICLE_LOCALE_NOT_FOUND", "This article is not available in the requested locale.", HttpStatus.NOT_FOUND, details);
  }
}

export class InvalidArticleLifecycleTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_ARTICLE_LIFECYCLE_TRANSITION", "This article status transition is not allowed.", HttpStatus.CONFLICT, details);
  }
}

/** A locale+slug pair must be unique across every article (spec: "duplicate localized slug rejected... avoid collisions per locale") — thrown instead of letting a raw P2002 leak. */
export class DuplicateArticleSlugException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("DUPLICATE_ARTICLE_SLUG", "This slug is already used by another article in this locale.", HttpStatus.CONFLICT, details);
  }
}

export class DuplicateCategorySlugException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("DUPLICATE_CATEGORY_SLUG", "This slug is already used by another category in this locale.", HttpStatus.CONFLICT, details);
  }
}

export class DuplicateTagSlugException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("DUPLICATE_TAG_SLUG", "This slug is already used by another tag in this locale.", HttpStatus.CONFLICT, details);
  }
}

export class CategoryNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CATEGORY_NOT_FOUND", "Category not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class TagNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("TAG_NOT_FOUND", "Tag not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class ContentAuthorNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CONTENT_AUTHOR_NOT_FOUND", "Content author not found.", HttpStatus.NOT_FOUND, details);
  }
}

export class MediaAssetNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MEDIA_ASSET_NOT_FOUND", "Media asset not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** A disabled asset can never be attached to new content (spec: "media deleted/disabled") — its existing, already-published usages keep resolving; only new selection is blocked. */
export class MediaAssetDisabledException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MEDIA_ASSET_DISABLED", "This media asset has been disabled and cannot be attached to new content.", HttpStatus.CONFLICT, details);
  }
}

export class UnsupportedMediaTypeException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("UNSUPPORTED_MEDIA_TYPE", "This file type is not supported for CMS media.", HttpStatus.BAD_REQUEST, details);
  }
}

export class MediaTooLargeException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("MEDIA_TOO_LARGE", "This file exceeds the maximum allowed size for CMS media.", HttpStatus.BAD_REQUEST, details);
  }
}

export class ContentVersionNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CONTENT_VERSION_NOT_FOUND", "Content version not found.", HttpStatus.NOT_FOUND, details);
  }
}

/** Thrown when a RichTextDocument fails structural validation (spec: "sanitize rich content"; "prevent arbitrary script injection") — an unrecognized block/mark type or an unsafe link href (not http(s):// or a same-origin relative path) is rejected outright rather than silently stripped, so an editor always knows their save failed rather than silently losing content. */
export class InvalidRichTextContentException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("INVALID_RICH_TEXT_CONTENT", "This content contains an unsupported or unsafe structure.", HttpStatus.BAD_REQUEST, details);
  }
}

export class ContentPlacementNotFoundException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("CONTENT_PLACEMENT_NOT_FOUND", "Content placement not found.", HttpStatus.NOT_FOUND, details);
  }
}
