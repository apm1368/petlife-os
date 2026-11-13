import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * TOTP secrets are encrypted at rest with AES-256-GCM, so a copy of the database alone can't mint admin codes.
 * The key is ADMIN_TWO_STEP_KEY when set, otherwise derived (HKDF) from SESSION_SECRET. Rotating whichever key is in
 * use invalidates every enrolled authenticator: the affected admins then sign in with a recovery code, or a
 * SUPER_ADMIN resets their two-step sign-in so they enrol again.
 */
const VERSION = "v1";

function key(material: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(material, "utf8"), Buffer.from("opetlife-admin-two-step"), Buffer.from(`totp-secret-${VERSION}`), 32));
}

export function sealSecret(secret: Buffer, material: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(material), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function openSecret(sealed: string, material: string): Buffer {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== VERSION || !iv || !body || !tag) throw new Error("Unsupported two-step secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(material), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
}
