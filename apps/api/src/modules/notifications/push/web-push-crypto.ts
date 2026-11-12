import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from "node:crypto";

/**
 * Web Push message encryption (RFC 8291, `aes128gcm` content coding from RFC 8188) and VAPID (RFC 8292), on Node's
 * own crypto. Small and fully specified, so the API needs no third-party push library: nothing here talks to the
 * network, and every key stays in memory.
 */

export const base64url = {
  encode: (value: Buffer | Uint8Array): string => Buffer.from(value).toString("base64url"),
  decode: (value: string): Buffer => Buffer.from(value.replace(/=+$/, ""), "base64url"),
};

/** One aes128gcm record; payloads are capped far below it, so a message is always a single (last) record. */
const RECORD_SIZE = 4096;
const P256_POINT_BYTES = 65;

export class PushKeyError extends Error {}

/**
 * Encrypts `plaintext` for one browser subscription. `p256dh` is the browser's P-256 public key (uncompressed point)
 * and `auth` its 16-byte secret, both base64url as PushSubscription.toJSON() gives them. `salt` and `serverKeys` are
 * injectable only so tests can replay the RFC 8291 example; production always uses fresh random ones.
 */
export function encryptPushPayload(
  plaintext: Buffer,
  p256dh: string,
  auth: string,
  testing: { salt?: Buffer; serverPrivateKey?: Buffer } = {},
): Buffer {
  const userAgentPublic = base64url.decode(p256dh);
  const authSecret = base64url.decode(auth);
  if (userAgentPublic.length !== P256_POINT_BYTES || userAgentPublic[0] !== 0x04) throw new PushKeyError("Invalid p256dh key");
  if (authSecret.length < 16) throw new PushKeyError("Invalid auth secret");

  const ecdh = createECDH("prime256v1");
  if (testing.serverPrivateKey) ecdh.setPrivateKey(testing.serverPrivateKey);
  else ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  let sharedSecret: Buffer;
  try {
    sharedSecret = ecdh.computeSecret(userAgentPublic);
  } catch {
    throw new PushKeyError("Invalid p256dh key");
  }

  // RFC 8291 §3.3/3.4: IKM from the ECDH secret and the auth secret, bound to both public keys.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), userAgentPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  // RFC 8188 §2.2/2.3: content-encryption key and nonce from a fresh salt.
  const salt = testing.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));

  // A single, last record: plaintext followed by the 0x02 delimiter (no extra padding).
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, ciphertext]);
}

/** The application server's VAPID key pair, in the base64url forms browsers and push services expect. */
export interface VapidKeys {
  /** Uncompressed P-256 point (65 bytes): `applicationServerKey` in the browser and `k=` in the header. */
  publicKey: string;
  /** The 32-byte private scalar. */
  privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const x = base64url.decode(jwk.x!);
  const y = base64url.decode(jwk.y!);
  return { publicKey: base64url.encode(Buffer.concat([Buffer.from([0x04]), x, y])), privateKey: jwk.d! };
}

/** JWT lifetime: RFC 8292 allows up to 24 h; 12 h keeps clear of clock skew at the push service. */
const VAPID_TOKEN_SECONDS = 12 * 60 * 60;

/**
 * The `Authorization: vapid t=…, k=…` header for one push request. The token is scoped to the push service's origin
 * (`aud`) and names the sender contact (`sub`).
 */
export function vapidAuthorization(endpoint: string, subject: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const publicPoint = base64url.decode(keys.publicKey);
  const privateScalar = base64url.decode(keys.privateKey);
  if (publicPoint.length !== P256_POINT_BYTES || publicPoint[0] !== 0x04 || privateScalar.length !== 32) throw new PushKeyError("Invalid VAPID keys");
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: base64url.encode(publicPoint.subarray(1, 33)),
      y: base64url.encode(publicPoint.subarray(33, 65)),
    },
  });
  const header = base64url.encode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64url.encode(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + VAPID_TOKEN_SECONDS, sub: subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${base64url.encode(signature)}, k=${keys.publicKey}`;
}
