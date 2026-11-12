/** A catalog node: text, a nested branch, or a list (the 2026-11 pattern keeps chapter and step lists as arrays). */
export type MessageValue = string | MessageTree | MessageValue[];
export interface MessageTree { [key: string]: MessageValue }

/** Apply a locale's translated branches over the complete English fallback tree. */
export function mergeMessages(fallback: MessageTree, localized: MessageTree): MessageTree {
  const result: MessageTree = { ...fallback };
  for (const [key, value] of Object.entries(localized)) {
    const current = fallback[key];
    result[key] = isMessageTree(current) && isMessageTree(value)
      ? mergeMessages(current, value)
      : value;
  }
  return result;
}

function isMessageTree(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
