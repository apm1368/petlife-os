import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { base64url, encryptPushPayload, generateVapidKeys, PushKeyError, vapidAuthorization } from "./web-push-crypto";
import { encodePushPayload } from "./web-push.service";

/** The browser's side of RFC 8291, written out independently so the test does not just mirror the encoder. */
function decryptAsBrowser(message: Buffer, uaPrivate: Buffer, authSecret: Buffer): Buffer {
  const salt = message.subarray(0, 16);
  const recordSize = message.readUInt32BE(16);
  const idLength = message.readUInt8(20);
  const serverPublic = message.subarray(21, 21 + idLength);
  const ciphertext = message.subarray(21 + idLength);
  expect(recordSize).toBe(4096);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(serverPublic);
  const ikm = Buffer.from(hkdfSync("sha256", secret, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, serverPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  expect(padded[end]).toBe(0x02);
  return padded.subarray(0, end);
}

describe("web push encryption (RFC 8291)", () => {
  it("reproduces the RFC 8291 Appendix A example byte for byte", () => {
    const message = encryptPushPayload(
      Buffer.from("When I grow up, I want to be a watermelon"),
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      "BTBZMqHH6r4Tts7J_aSIgg",
      { salt: base64url.decode("DGv6ra1nlYgDCS1FRnbzlw"), serverPrivateKey: base64url.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") },
    );
    expect(base64url.encode(message)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("encrypts a payload a browser can decrypt, with a fresh key and salt every time", () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const auth = randomBytes(16);
    const payload = encodePushPayload({ id: "n-1", title: "یادآور تازهٔ مراقبت", url: "https://opetlife.ir/fa/notifications", lang: "fa", dir: "rtl" });
    const a = encryptPushPayload(Buffer.from(payload), base64url.encode(browser.getPublicKey()), base64url.encode(auth));
    const b = encryptPushPayload(Buffer.from(payload), base64url.encode(browser.getPublicKey()), base64url.encode(auth));
    expect(a.equals(b)).toBe(false);
    expect(decryptAsBrowser(a, browser.getPrivateKey(), auth).toString("utf8")).toBe(payload);
    expect(JSON.parse(payload)).toEqual({ id: "n-1", title: "یادآور تازهٔ مراقبت", url: "https://opetlife.ir/fa/notifications", lang: "fa", dir: "rtl", silent: false });
  });

  it("rejects malformed subscription keys before anything is sent", () => {
    expect(() => encryptPushPayload(Buffer.from("x"), base64url.encode(randomBytes(65)), base64url.encode(randomBytes(16)))).toThrow(PushKeyError);
    expect(() => encryptPushPayload(Buffer.from("x"), "abc", base64url.encode(randomBytes(16)))).toThrow(PushKeyError);
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    expect(() => encryptPushPayload(Buffer.from("x"), base64url.encode(browser.getPublicKey()), "abc")).toThrow(PushKeyError);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs an ES256 token for the push service origin that verifies with the public key", () => {
    const keys = generateVapidKeys();
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc:def", "https://opetlife.ir", keys, 1_700_000_000);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(base64url.decode(head!).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(base64url.decode(claims!).toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: "https://opetlife.ir" });
    const point = base64url.decode(keys.publicKey);
    const publicKey = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: base64url.encode(point.subarray(1, 33)), y: base64url.encode(point.subarray(33)) } });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, base64url.decode(signature!))).toBe(true);
  });

  it("refuses keys that are not a P-256 pair", () => {
    expect(() => vapidAuthorization("https://fcm.googleapis.com/x", "https://opetlife.ir", { publicKey: "abc", privateKey: "def" })).toThrow(PushKeyError);
  });
});
