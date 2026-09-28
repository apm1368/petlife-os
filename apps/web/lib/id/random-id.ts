/**
 * RFC 4122 v4 id for idempotency keys and client-side ids.
 *
 * `crypto.randomUUID` exists only in secure contexts (https/localhost); the staging site is served
 * over plain http, where calling it throws and crashed the booking and checkout pages. Falls back to
 * `crypto.getRandomValues`, which is available in every context.
 */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
