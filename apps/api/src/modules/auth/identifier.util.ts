import { ValidationApiException } from "../../common/errors/api-exception";
import { normalizeIranianPhone } from "../../common/phone/phone-normalizer";

export type IdentifierKind = "email" | "phone";

/**
 * Email (lower-cased) or an Iranian mobile in canonical E.164. The returned value is what the API stores, looks
 * users up by and keys rate limits on, so every spelling of one number is one account and one limiter budget.
 * Anything else is rejected rather than stored as typed.
 */
export function classifyIdentifier(identifier: string): { kind: IdentifierKind; value: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  const phone = normalizeIranianPhone(trimmed);
  if (!phone) throw new ValidationApiException({ field: "identifier", reason: "Enter an email address or an Iranian mobile number." });
  return { kind: "phone", value: phone.e164 };
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
