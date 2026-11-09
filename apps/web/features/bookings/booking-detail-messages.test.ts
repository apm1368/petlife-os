import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

function messageShape(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageShape(child)]));
}

describe("booking detail translations", () => {
  it("provides every English booking-detail key in German and Spanish", () => {
    const englishShape = messageShape(en.bookingDetail);
    expect(messageShape(de.bookingDetail)).toEqual(englishShape);
    expect(messageShape(es.bookingDetail)).toEqual(englishShape);
  });
});
