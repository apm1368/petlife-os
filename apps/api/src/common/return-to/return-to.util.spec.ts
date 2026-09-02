import { sanitizeReturnTo } from "./return-to.util";

describe("sanitizeReturnTo", () => {
  const fallback = "/home";

  it("accepts a plain internal path", () => {
    expect(sanitizeReturnTo("/vet/abc/book", fallback)).toBe("/vet/abc/book");
  });

  it("accepts an internal path with a query string", () => {
    expect(sanitizeReturnTo("/shop/products?category=food", fallback)).toBe("/shop/products?category=food");
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

  it("rejects an embedded scheme after decoding", () => {
    expect(sanitizeReturnTo(encodeURIComponent("/javascript:alert(1)"), fallback)).toBe(fallback);
  });

  it("rejects a smuggled control character after decoding", () => {
    expect(sanitizeReturnTo("/%0d%0aSet-Cookie:%20evil", fallback)).toBe(fallback);
  });

  it("rejects an undecodable value", () => {
    expect(sanitizeReturnTo("/%", fallback)).toBe(fallback);
  });
});
