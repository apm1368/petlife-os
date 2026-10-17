import { createHash } from "node:crypto";

/** Key-order-independent (Postgres jsonb reorders object keys), Date-safe canonical form. */
export const stable = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v);
export const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(stable(v)) ?? "null").digest("hex").slice(0, 32);

/** Compact, size-limited copy of a raw payload for short-term evidence (never whole pages kept indefinitely). */
export function compactRaw(payload: unknown, maxChars = 4000): unknown {
  const text = JSON.stringify(stable(payload)) ?? "null";
  return text.length <= maxChars ? JSON.parse(text) : { truncated: true, length: text.length, head: text.slice(0, maxChars) };
}
