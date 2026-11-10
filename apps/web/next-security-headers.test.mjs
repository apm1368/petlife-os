import { describe, expect, it } from "vitest";
import config from "./next.config.mjs";

async function ownedHeaders() {
  const rules = await config.headers?.();
  expect(rules).toEqual(expect.any(Array));
  const global = rules.find((rule) => rule.source === "/:path*");
  expect(global).toBeDefined();
  return Object.fromEntries(global.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("web response-header security boundary", () => {
  it("disables MIME sniffing and uses explicit origin-only cross-site referrers", async () => {
    const headers = await ownedHeaders();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("allows same-origin framing but denies arbitrary third-party framing", async () => {
    const headers = await ownedHeaders();
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["content-security-policy"]).toBe("frame-ancestors 'self'");
  });

  it("does not silently block existing scripts, private media or device controls", async () => {
    const headers = await ownedHeaders();
    expect(headers["content-security-policy"]).not.toMatch(/(?:script|default|img|connect)-src/);
    expect(headers["permissions-policy"]).toBeUndefined();
  });

  it("does not override route cache, MIME or existing transport policy", async () => {
    const headers = await ownedHeaders();
    for (const key of ["cache-control", "content-type", "strict-transport-security"]) {
      expect(headers[key]).toBeUndefined();
    }
  });
});
