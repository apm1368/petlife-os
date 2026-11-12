import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP): HMAC-SHA1, 6 digits, 30-second steps — the defaults
 * every authenticator app (Google/Microsoft Authenticator, 1Password, Bitwarden, Aegis…) uses. Kept dependency-free
 * so the whole verifier is readable in one file.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too, for phone clocks that drift up to ~30 s. */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = BASE32.indexOf(ch);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * What people actually type: Persian (۰–۹) and Arabic-Indic (٠–٩) digits from a Persian keyboard, spaces, dashes and
 * the invisible direction marks RTL text fields insert. All of it reads as the same ASCII code.
 */
export function normalizeCodeInput(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\s\-\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
}

/** A fresh 160-bit secret (the RFC 4226 recommended length). */
export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * The step a code belongs to, or null. Only steps after `lastUsedStep` count, so a code that was already accepted
 * (or any earlier one) can never be replayed, even inside its 30-second window.
 */
export function matchTotp(secret: Buffer, code: string, lastUsedStep: number, at: Date = new Date()): number | null {
  const digits = normalizeCodeInput(code);
  if (!/^\d{6}$/.test(digits)) return null;
  const now = totpStep(at);
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    if (step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(digits))) return step;
  }
  return null;
}

/** otpauth:// URI the authenticator apps read from the QR code (Key Uri Format). */
export function otpauthUri(secret: Buffer, issuer: string, account: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret: base32Encode(secret), issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Recovery codes: 80 random bits each, shown once as XXXX-XXXX-XXXX-XXXX (base32, no 0/1/8/9 to misread). */
export const RECOVERY_CODE_COUNT = 10;

export function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(10)); // 16 characters
  return raw.match(/.{4}/g)!.join("-");
}

export function normalizeRecoveryCode(input: string): string {
  return normalizeCodeInput(input).toUpperCase().replace(/[^A-Z2-7]/g, "");
}

/** 80-bit random codes don't need a slow hash; a plain SHA-256 of the normalized code is stored, never the code. */
export function hashRecoveryCode(input: string): string {
  return createHash("sha256").update(`opetlife-recovery:${normalizeRecoveryCode(input)}`).digest("hex");
}
