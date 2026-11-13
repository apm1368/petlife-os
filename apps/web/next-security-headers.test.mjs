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
    expect(headers["content-security-policy"]).toBe("frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  });

  it("does not advertise the framework or proxy arbitrary remote images", () => {
    expect(config.poweredByHeader).toBe(false);
    expect(config.images?.remotePatterns ?? []).toEqual([]);
    expect(config.images?.qualities).toEqual([75]);
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

  it("sends the Android APK download as an installer file", async () => {
    const rules = await config.headers?.();
    const apk = rules.find((rule) => rule.source.startsWith("/app/"));
    expect(apk).toBeDefined();
    const headers = Object.fromEntries(apk.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers["content-type"]).toBe("application/vnd.android.package-archive");
    expect(headers["content-disposition"]).toBe("attachment");
    expect(new RegExp(`^${apk.source.replace("/app/:file(", "/app/(")}$`).test("/app/opetlife.apk")).toBe(true);
  });
});

