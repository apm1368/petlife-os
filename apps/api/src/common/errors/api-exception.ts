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
