import { base32Decode, base32Encode, hashRecoveryCode, hotp, matchTotp, newRecoveryCode, normalizeCodeInput, normalizeRecoveryCode, otpauthUri, totpStep } from "./totp";
import { openSecret, sealSecret } from "./two-step-secret";

// RFC 6238 Appendix B (SHA-1 seed "12345678901234567890"); the 8-digit vectors' last 6 digits are the 6-digit codes.
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("matches the RFC vector at T=%s", (seconds, expected) => {
    const step = totpStep(new Date(seconds * 1000));
    expect(hotp(RFC_SECRET, step, 8)).toBe(expected);
    expect(hotp(RFC_SECRET, step)).toBe(expected.slice(2));
  });

  it("round-trips base32 (RFC 4648 test strings)", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi").toString()).toBe("foobar");
    const secret = Buffer.from("0123456789abcdefghij");
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
  });

  it("accepts the current and adjacent steps once, and never an already-used step", () => {
    const at = new Date(1234567890 * 1000);
    const step = totpStep(at);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), 0, at)).toBe(step);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), 0, at)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), 0, at)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), 0, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), step, at)).toBeNull(); // replay
    expect(matchTotp(RFC_SECRET, "12345", 0, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", 0, at)).toBeNull();
  });

  it("accepts codes typed on a Persian or Arabic keyboard, with spaces, dashes and direction marks", () => {
    const at = new Date(1234567890 * 1000);
    const step = totpStep(at);
    const ascii = hotp(RFC_SECRET, step); // "005924"
    const persian = ascii.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
    const arabic = ascii.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    expect(persian).toBe("۰۰۵۹۲۴");
    expect(normalizeCodeInput("\u200F۱۲۳ ۴۵۶\u200E")).toBe("123456");
    expect(normalizeCodeInput("١٢٣-٤٥٦")).toBe("123456");
    expect(matchTotp(RFC_SECRET, persian, 0, at)).toBe(step);
    expect(matchTotp(RFC_SECRET, `${arabic.slice(0, 3)} ${arabic.slice(3)}`, 0, at)).toBe(step);
    // Recovery codes carry digits 2–7, which may be typed in Persian too.
    expect(normalizeRecoveryCode("abcd-efgh-۲۳۴۵-۶۷۲۳")).toBe("ABCDEFGH23456723");
  });

  it("builds an otpauth URI the authenticator apps read", () => {
    const uri = otpauthUri(RFC_SECRET, "opetlife", "admin@example.com");
    expect(uri.startsWith("otpauth://totp/opetlife:admin%40example.com?")).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get("secret")).toBe(base32Encode(RFC_SECRET));
    expect(params.get("issuer")).toBe("opetlife");
    expect(params.get("digits")).toBe("6");
  });

  it("formats recovery codes and hashes them independent of case and dashes", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(code.replace(/-/g, ""));
    expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(` ${code.toLowerCase().replace(/-/g, " ")} `));
    expect(hashRecoveryCode(code)).not.toContain(code.replace(/-/g, ""));
  });

  it("seals secrets so only the same key opens them", () => {
    const sealed = sealSecret(RFC_SECRET, "a-long-enough-session-secret");
    expect(sealed).not.toContain(base32Encode(RFC_SECRET));
    expect(openSecret(sealed, "a-long-enough-session-secret").equals(RFC_SECRET)).toBe(true);
    expect(() => openSecret(sealed, "another-secret-entirely")).toThrow();
  });
});
