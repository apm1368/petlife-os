import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorBody } from "@petlife/types";
import { Prisma } from "@prisma/client";
import { ApiException } from "../errors/api-exception";
import type { RequestWithId } from "../middleware/request-id.middleware";

/**
 * Every error response — domain (ApiException), framework (HttpException,
 * e.g. the ValidationPipe's 400), or unexpected — is normalized to the one
 * { error: { code, message, details, requestId } } contract.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? "unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred.";
    let details: Record<string, unknown> | undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = httpStatusToCode(status);
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "message" in body) {
        const rawMessage = (body as { message: unknown }).message;
        message = Array.isArray(rawMessage) ? rawMessage.join("; ") : String(rawMessage);
        if (Array.isArray(rawMessage)) details = { validation: rawMessage };
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2023") {
      // A malformed id reached a uuid column (route without ParseUUIDPipe): the client's input, never a 500.
      status = HttpStatus.BAD_REQUEST;
      code = "VALIDATION_ERROR";
      message = "The request did not pass validation.";
      details = { reason: "INVALID_ID" };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2025") {
      // update/delete on a row that doesn't exist (or no longer does).
      status = HttpStatus.NOT_FOUND;
      code = "NOT_FOUND";
      message = "Resource not found.";
    } else if (isClientHttpError(exception)) {
      // Raised by the body parser before any handler runs (body too large, malformed JSON): the
      // client's fault, so its own 4xx — not a 500 that pages someone.
      status = exception.status;
      code = httpStatusToCode(status);
      message = status === HttpStatus.PAYLOAD_TOO_LARGE ? "The request body is too large." : "The request body could not be read.";
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception), undefined, { requestId });
    }

    const body: ApiErrorBody = {
      error: { code, message, details, requestId },
    };

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${code}: ${message}`);
    }

    response.status(status).json(body);
  }
}

function isClientHttpError(exception: unknown): exception is { status: number } {
  const e = exception as { status?: unknown; expose?: unknown } | null;
  return !!e && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.expose === true;
}

function httpStatusToCode(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return "PAYLOAD_TOO_LARGE";
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}
