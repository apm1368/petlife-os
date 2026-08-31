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
