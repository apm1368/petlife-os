import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "../../../config/env";
import { GoogleAuthDisabledException, GoogleAuthFailedException } from "../../../common/errors/api-exception";
import type { GoogleProfile } from "./google-profile.types";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * The real (network-calling) half of Google sign-in: builds the
 * authorization redirect, exchanges an authorization code for tokens, and
 * verifies an id_token's signature/issuer/audience/nonce against Google's
 * own JWKS. There is no "DevGoogleAdapter" the way DevPaymentGateway or
 * DevShippingAdapter exist — those simulate business logic PET LIFE OS
 * itself owns; verifying a third party's identity assertion has no honest
 * local simulation, so dev/test coverage instead bypasses this client
 * entirely via the dedicated /dev/auth/google/simulate endpoint (see
 * AuthGoogleDevController), which calls AuthGoogleService directly with an
 * already-"verified" profile.
 */
@Injectable()
export class GoogleOAuthClient {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  isEnabled(): boolean {
    return (
      this.config.get("GOOGLE_AUTH_ENABLED", { infer: true }) &&
      !!this.config.get("GOOGLE_CLIENT_ID", { infer: true }) &&
      !!this.config.get("GOOGLE_CLIENT_SECRET", { infer: true }) &&
      !!this.config.get("GOOGLE_CALLBACK_URL", { infer: true })
    );
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) throw new GoogleAuthDisabledException();
  }

  buildAuthorizationUrl(state: string, nonce: string): string {
    this.assertEnabled();
    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set("client_id", this.config.get("GOOGLE_CLIENT_ID", { infer: true })!);
    url.searchParams.set("redirect_uri", this.config.get("GOOGLE_CALLBACK_URL", { infer: true })!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    // Always show the account chooser rather than silently reusing whatever
    // Google session happens to be active in the browser.
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async exchangeCodeAndVerify(code: string, expectedNonce: string): Promise<GoogleProfile> {
    this.assertEnabled();

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.config.get("GOOGLE_CLIENT_ID", { infer: true })!,
          client_secret: this.config.get("GOOGLE_CLIENT_SECRET", { infer: true })!,
          redirect_uri: this.config.get("GOOGLE_CALLBACK_URL", { infer: true })!,
          grant_type: "authorization_code",
        }),
      });
    } catch {
      throw new GoogleAuthFailedException();
    }

    if (!tokenResponse.ok) throw new GoogleAuthFailedException();
    const tokenBody: unknown = await tokenResponse.json().catch(() => null);
    const idToken = (tokenBody as { id_token?: string } | null)?.id_token;
    if (!idToken) throw new GoogleAuthFailedException();

    return this.verifyIdToken(idToken, expectedNonce);
  }

  private async verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleProfile> {
    this.jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, this.jwks, {
        audience: this.config.get("GOOGLE_CLIENT_ID", { infer: true })!,
      });
      payload = result.payload;
    } catch {
      throw new GoogleAuthFailedException();
    }

    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    if (!GOOGLE_ISSUERS.has(issuer)) throw new GoogleAuthFailedException();
    if (payload.nonce !== expectedNonce) throw new GoogleAuthFailedException();

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) throw new GoogleAuthFailedException();

    return {
      sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  }
}
