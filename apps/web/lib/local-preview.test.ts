import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalPreviewHost } from "./local-preview";
import { apiFetch } from "./api/client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("local review boundary", () => {
  it("requires opt-in and an exact loopback host", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(isLocalPreviewHost(host, "1")).toBe(true);
      expect(isLocalPreviewHost(host, undefined)).toBe(false);
      expect(isLocalPreviewHost(host, "0")).toBe(false);
    }
    for (const host of ["petlife.example", "localhost.evil.test", "192.168.1.10", "0.0.0.0"]) {
      expect(isLocalPreviewHost(host, "1")).toBe(false);
    }
  });
  it("does not send preview payments or mutations to an API", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "1");
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      await expect(apiFetch("/checkout", { method })).rejects.toMatchObject({ code: "LOCAL_PREVIEW_READ_ONLY" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
