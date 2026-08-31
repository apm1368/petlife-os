import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorBody } from "@petlife/types";
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

function httpStatusToCode(status: HttpStatus): string {
  switch (status) {
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
