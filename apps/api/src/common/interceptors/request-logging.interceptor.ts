import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "../middleware/request-id.middleware";

/**
 * One structured completion line per request (Handoff 20 observability):
 * requestId, method, route, status, duration, and the controller/handler as
 * a stand-in for "service/module" — enough to correlate a request across
 * logs without a dedicated APM. Never logs the body, query, headers or path
 * parameters (the route template is logged, e.g. `/health-shares/:token`), so
 * it can never leak a password/OTP/token/health-document content the way a
 * naive request logger would; ApiExceptionFilter already logs unexpected
 * errors separately with the same requestId for correlation.
 *
 * Logs on the response's own `finish` event rather than this interceptor's
 * success/error callback — Nest's exception filters run after an
 * interceptor's error path, so reading `response.statusCode` there would
 * still show the pre-filter default (200) instead of the real error status;
 * `finish` fires only once the full response, filter-set status included,
 * has actually gone out.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = Date.now();
    const handlerName = `${context.getClass().name}.${context.getHandler().name}`;

    response.once("finish", () => {
      const durationMs = Date.now() - start;
      this.logger.log(`${request.method} ${loggedRoute(request)} ${response.statusCode} ${durationMs}ms requestId=${request.requestId ?? "unknown"} handler=${handlerName}`);
    });

    return next.handle();
  }
}

/**
 * The matched route template (`/households/invitations/:token`) rather than the concrete URL: bearer tokens in
 * paths (invitations, pet cards, health shares, downloads) and query strings never reach the log stream.
 */
export function loggedRoute(request: { baseUrl?: string; route?: { path?: unknown }; path?: string; url?: string }): string {
  const template = typeof request.route?.path === "string" ? `${request.baseUrl ?? ""}${request.route.path}` : null;
  if (template) return template;
  return (request.path ?? request.url ?? "").split("?")[0] || "/";
}
