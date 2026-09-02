export type IdentifierKind = "email" | "phone";

export function classifyIdentifier(identifier: string): { kind: IdentifierKind; value: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  return { kind: "phone", value: trimmed.replace(/[\s-]/g, "") };
}

/** Case-insensitive uniqueness for usernames: "Sarah" and "sarah" are the same account. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Forgot-password accepts either a username or an email in one field — same heuristic as classifyIdentifier, kept separate since a username may legally contain no "@" but also isn't a phone number. */
export function classifyLoginIdentifier(identifier: string): { kind: "email" | "username"; value: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return { kind: "email", value: trimmed.toLowerCase() };
  return { kind: "username", value: normalizeUsername(trimmed) };
}
