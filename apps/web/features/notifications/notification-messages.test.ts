import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fa from "@/messages/fa.json";

function messageShape(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageShape(child)]));
}

describe("notification translations", () => {
  it("keeps all center and preference keys available in every supported locale", () => {
    const englishShape = messageShape(en.notifications);
    expect(messageShape(de.notifications)).toEqual(englishShape);
    expect(messageShape(es.notifications)).toEqual(englishShape);
    expect(messageShape(fa.notifications)).toEqual(englishShape);
  });
});
