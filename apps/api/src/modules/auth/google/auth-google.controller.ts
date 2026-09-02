import { Controller, Get, Query, Req, Res, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { AppEnv } from "../../../config/env";
import { sanitizeReturnTo } from "../../../common/return-to/return-to.util";
import { generateOAuthToken, signOAuthState, verifyOAuthState } from "../../../common/oauth/oauth-state.util";
import { GoogleAuthFailedException } from "../../../common/errors/api-exception";
import { GoogleOAuthClient } from "./google-oauth.client";
import { AuthGoogleService } from "./auth-google.service";

export const OAUTH_STATE_COOKIE_NAME = "petlife_oauth_state";

/**
 * The full-page-navigation half of Google sign-in: GET /auth/google sends
 * the browser to Google, GET /auth/google/callback receives it back. Both
 * are real redirects (never JSON responses to the browser itself), matching
 * how a browser-driven OAuth flow actually works — see AuthGoogleDevController
 * for the JSON-returning dev/test equivalent that skips the real network hop.
 */
@Controller("auth/google")
export class AuthGoogleController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly googleClient: GoogleOAuthClient,
    private readonly authGoogle: AuthGoogleService,
  ) {}

  private get webAppOrigin(): string {
    return this.config.get("WEB_APP_ORIGIN", { infer: true }).split(",")[0]!;
  }

  private get isProduction(): boolean {
    return this.config.get("NODE_ENV", { infer: true }) === "production";
  }

  @Get()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  start(@Query("returnTo") returnTo: string | undefined, @Res() res: Response): void {
    const sanitized = sanitizeReturnTo(returnTo, "/welcome");
    const state = generateOAuthToken();
    const nonce = generateOAuthToken();

    const cookieValue = signOAuthState(
      { state, nonce, returnTo: sanitized, issuedAt: Date.now() },
      this.config.get("SESSION_SECRET", { infer: true }),
    );
    res.cookie(OAUTH_STATE_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(HttpStatus.FOUND, this.googleClient.buildAuthorizationUrl(state, nonce));
  }

  @Get("callback")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieValue = (req as unknown as { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE_NAME];
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });

    try {
      const payload = verifyOAuthState(cookieValue, this.config.get("SESSION_SECRET", { infer: true }));
      if (!payload || !code || !state || state !== payload.state) throw new GoogleAuthFailedException();

      const profile = await this.googleClient.exchangeCodeAndVerify(code, payload.nonce);
      await this.authGoogle.signIn(profile, res, { userAgent: req.headers["user-agent"], ipAddress: req.ip });

      res.redirect(HttpStatus.FOUND, `${this.webAppOrigin}/auth/complete?returnTo=${encodeURIComponent(payload.returnTo)}`);
    } catch {
      res.redirect(HttpStatus.FOUND, `${this.webAppOrigin}/welcome?error=google_auth_failed`);
    }
  }
}
