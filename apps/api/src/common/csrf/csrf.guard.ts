import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../errors/api-exception";
import { HttpStatus } from "@nestjs/common";
import { CSRF_COOKIE_NAME } from "./csrf.middleware";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Payment gateway webhooks (Handoff 06) are server-to-server, not
 * browser-originated — there is no session cookie for a CSRF double-submit
 * token to protect, and a real gateway has no way to present one. They are
 * authenticated instead by their own signature header (see
 * WebhookSignatureVerifier), which the double-submit pattern isn't meant to
 * replace.
 */
const CSRF_EXEMPT_PREFIXES = ["/payments/webhooks/"];

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (CSRF_EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return true;

    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers["x-csrf-token"];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ApiException("CSRF_TOKEN_INVALID", "Missing or invalid CSRF token.", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
