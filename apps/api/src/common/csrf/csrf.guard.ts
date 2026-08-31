import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ApiException } from "../errors/api-exception";
import { HttpStatus } from "@nestjs/common";
import { CSRF_COOKIE_NAME } from "./csrf.middleware";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers["x-csrf-token"];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ApiException("CSRF_TOKEN_INVALID", "Missing or invalid CSRF token.", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
