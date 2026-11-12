import { describe, expect, it } from "vitest";
import fa from "./fa.json";

// The approved Persian wordmark is «اپت لایف» (docs/design/pattern-2026-11). Operational panels follow in their own round.
const OPERATIONAL = /^(admin|seller|provider|clinic|partnerVerification|adminInsuranceProviders|insurer|ngo)/;

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

describe("Persian brand wordmark", () => {
  it("writes the brand as «اپت لایف» in member and public Persian copy", () => {
    const latin = flatten(fa).filter(([key, text]) => !OPERATIONAL.test(key) && /opetlife(?![.\w@/-])/.test(text));
    expect(latin).toEqual([]);
  });
});
