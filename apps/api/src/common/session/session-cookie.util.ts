import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The cookie value is `${sessionId}.${hmac}` so a tampered/guessed cookie is
 * rejected by signature before we ever hit the database.
 */
export function signSessionCookie(sessionId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(sessionId).digest("hex");
  return `${sessionId}.${signature}`;
}

export function verifySessionCookie(cookieValue: string | undefined, secret: string): string | null {
  if (!cookieValue) return null;
  const [sessionId, signature] = cookieValue.split(".");
  if (!sessionId || !signature) return null;

  const expected = createHmac("sha256", secret).update(sessionId).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  return sessionId;
}
