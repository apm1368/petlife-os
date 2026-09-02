import { describe, expect, it } from "vitest";
import { buildLoginUrl, sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  const fallback = "/en/home";

  it("accepts a plain internal path", () => {
    expect(sanitizeReturnTo("/en/vet/abc/book", fallback)).toBe("/en/vet/abc/book");
  });

  it("falls back for a missing value", () => {
    expect(sanitizeReturnTo(undefined, fallback)).toBe(fallback);
    expect(sanitizeReturnTo(null, fallback)).toBe(fallback);
    expect(sanitizeReturnTo("", fallback)).toBe(fallback);
  });

  it("rejects an absolute URL to another host", () => {
    expect(sanitizeReturnTo("https://evil.example/phish", fallback)).toBe(fallback);
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeReturnTo("//evil.example/phish", fallback)).toBe(fallback);
  });

  it("rejects a backslash-based protocol-relative URL", () => {
    expect(sanitizeReturnTo("/\\evil.example", fallback)).toBe(fallback);
  });

  it("rejects a path missing the leading slash", () => {
    expect(sanitizeReturnTo("vet/abc", fallback)).toBe(fallback);
  });
});

describe("buildLoginUrl", () => {
  it("builds a /welcome URL carrying the returnTo path", () => {
    expect(buildLoginUrl("en", "/en/vet/abc/book")).toBe("/en/welcome?returnTo=%2Fen%2Fvet%2Fabc%2Fbook");
  });
});
