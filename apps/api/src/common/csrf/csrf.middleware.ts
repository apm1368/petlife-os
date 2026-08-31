import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "../../config/env";

export const CSRF_COOKIE_NAME = "petlife_csrf";

/**
 * Double-submit cookie CSRF strategy: a non-HttpOnly cookie carries a random
 * token; state-changing requests must echo it in the X-CSRF-Token header.
 * A cross-site page cannot read the cookie to produce a matching header.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    if (!cookies?.[CSRF_COOKIE_NAME]) {
      const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";
      res.cookie(CSRF_COOKIE_NAME, randomUUID(), {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
      });
    }
    next();
  }
}
