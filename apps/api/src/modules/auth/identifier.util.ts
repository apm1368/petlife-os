export type IdentifierKind = "email" | "phone";

export function classifyIdentifier(identifier: string): { kind: IdentifierKind; value: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  return { kind: "phone", value: trimmed.replace(/[\s-]/g, "") };
}
