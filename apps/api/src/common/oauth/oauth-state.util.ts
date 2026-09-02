import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  state: string;
  nonce: string;
  returnTo: string;
  issuedAt: number;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function generateOAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The OAuth `state`/`nonce` handshake needs somewhere to live between the
 * `/auth/google` redirect and the `/auth/google/callback` request — both are
 * full browser navigations, so there is no request-scoped memory to hold
 * them. A short-lived, signed, httpOnly cookie (mirroring the HMAC scheme
 * `session-cookie.util.ts` already uses for the session cookie) avoids
 * needing a server-side store for a value that only ever needs to survive
 * one round trip to Google and back.
 */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(cookieValue: string | undefined, secret: string): OAuthStatePayload | null {
  if (!cookieValue) return null;
  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", secret).update(encoded).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  try {
    const payload: OAuthStatePayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (Date.now() - payload.issuedAt > OAUTH_STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
