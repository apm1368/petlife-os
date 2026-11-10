import { afterEach, describe, expect, it, vi } from "vitest";
const { host } = vi.hoisted(() => ({ host: { value: "opetlife.ir" } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: host.value }) }));
import { isLocalPreviewRequest } from "./local-preview-server";

afterEach(() => vi.unstubAllEnvs());
describe("async request preview boundary", () => {
  it("rejects a public deployment even with the review flag enabled", async () => {
    host.value = "opetlife.ir";
    vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "1");
    await expect(isLocalPreviewRequest()).resolves.toBe(false);
  });
  it("requires the explicit review flag on localhost", async () => {
    host.value = "localhost:3000";
    vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "0");
    await expect(isLocalPreviewRequest()).resolves.toBe(false);
  });
  it("permits the explicitly enabled loopback review build", async () => {
    host.value = "localhost:3000";
    vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "1");
    await expect(isLocalPreviewRequest()).resolves.toBe(true);
  });
});
