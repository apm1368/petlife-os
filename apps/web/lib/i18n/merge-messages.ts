export interface MessageTree { [key: string]: string | MessageTree }

/** Apply a locale's translated branches over the complete English fallback tree. */
export function mergeMessages(fallback: MessageTree, localized: MessageTree): MessageTree {
  const result: MessageTree = { ...fallback };
  for (const [key, value] of Object.entries(localized)) {
    const current = fallback[key];
    result[key] = isMessageTree(current) && isMessageTree(value)
      ? mergeMessages(current, value)
      : value as string | MessageTree;
  }
  return result;
}

function isMessageTree(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
