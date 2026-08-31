import { signSessionCookie, verifySessionCookie } from "./session-cookie.util";

describe("session cookie signing", () => {
  const secret = "test-secret-value-1234567890";

  it("round-trips a signed session id", () => {
    const cookie = signSessionCookie("session-123", secret);
    expect(verifySessionCookie(cookie, secret)).toBe("session-123");
  });

  it("rejects a tampered session id", () => {
    const cookie = signSessionCookie("session-123", secret);
    const [, signature] = cookie.split(".");
    const tampered = `session-456.${signature}`;
    expect(verifySessionCookie(tampered, secret)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = signSessionCookie("session-123", "a-completely-different-secret");
    expect(verifySessionCookie(cookie, secret)).toBeNull();
  });

  it("returns null for a missing cookie", () => {
    expect(verifySessionCookie(undefined, secret)).toBeNull();
  });
});
