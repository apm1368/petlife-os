import * as argon2 from "argon2";

/**
 * Argon2id is the OWASP-recommended default for new password stores — unlike
 * the SHA-256 used for OTP codes (DevOtpProvider) and session-cookie HMACs
 * elsewhere in this codebase, a password is long-lived and worth a real
 * memory-hard KDF. `argon2.hash`/`argon2.verify` embed the algorithm
 * parameters and a random salt in the output string itself, so no separate
 * salt column is needed.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed/foreign hash string throws rather than returning false —
    // treat it as "does not match" rather than letting it bubble up as a 500.
    return false;
  }
}
