import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

function messageShape(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageShape(child)]));
}

describe("customer support translations", () => {
  it("provides every English customer-support key in German and Spanish", () => {
    const englishShape = messageShape(en.support);
    expect(messageShape(de.support)).toEqual(englishShape);
    expect(messageShape(es.support)).toEqual(englishShape);
  });
});
