/** Words per minute used for every locale: a deliberately plain, deterministic estimate (no marketing rounding). */
const WORDS_PER_MINUTE = 200;

/** Collects every `text` leaf of a rich-text document (any node shape). */
function collectText(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return void node.forEach((n) => collectText(n, out));
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === "string") out.push(obj.text);
  for (const [key, value] of Object.entries(obj)) if (key !== "text" && typeof value === "object") collectText(value, out);
}

/** Server-derived reading time in whole minutes (minimum 1). Persian and English both split on whitespace. */
export function estimateReadingMinutes(body: unknown, extra: string[] = []): number {
  const parts: string[] = [...extra];
  collectText(body, parts);
  const words = parts.join(" ").split(/[\s‌]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
