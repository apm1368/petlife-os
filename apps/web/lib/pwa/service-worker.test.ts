import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Runs public/sw.js in a fake worker scope and checks what it intercepts. The rule that matters: pages, /api and
 * other origins are never answered from a cache.
 */
type Handler = (event: Record<string, unknown>) => void;

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const scope = {
    location: new URL("https://opetlife.ir/sw.js"),
    addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
    skipWaiting: vi.fn(),
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
      navigationPreload: null,
      pushManager: { subscribe: vi.fn(() => Promise.resolve()) },
    },
    clients: { matchAll: () => Promise.resolve([]), openWindow: (url: string) => (opened.push(url), Promise.resolve()), claim: vi.fn() },
  };
  const cache = { match: async () => undefined, put: async () => undefined, keys: async () => [], delete: async () => true };
  const caches = { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true };
  const network = vi.fn(async () => new Response("ok", { status: 200 }));
  const source = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", "Response", "Request", source)(scope, caches, network, Response, Request);
  return { handlers, shown, opened };
}

function fetchEvent(url: string, init: { mode?: string; method?: string; headers?: Record<string, string> } = {}) {
  const respondWith = vi.fn();
  return {
    event: { request: { url, method: init.method ?? "GET", mode: init.mode ?? "no-cors", headers: new Headers(init.headers ?? {}) }, respondWith, waitUntil: vi.fn(), preloadResponse: Promise.resolve(undefined) },
    respondWith,
  };
}

describe("service worker", () => {
  it("never answers API calls, other origins, writes, RSC or media ranges", () => {
    const { handlers } = loadWorker();
    for (const [url, init] of [
      ["https://opetlife.ir/api/me", {}],
      ["https://opetlife.ir/api/pets/p1/health", { mode: "navigate" }],
      ["https://cdn.example.com/x.js", {}],
      ["https://opetlife.ir/_next/static/chunks/a.js", { method: "POST" }],
      ["https://opetlife.ir/fa/home?_rsc=abc", {}],
      ["https://opetlife.ir/fa/home", { headers: { RSC: "1" } }],
      ["https://opetlife.ir/audio/reel.mp3", { headers: { Range: "bytes=0-" } }],
      ["https://opetlife.ir/uploads/pets/p1.jpg", {}],
    ] as const) {
      const { event, respondWith } = fetchEvent(url, init);
      handlers.fetch!(event);
      expect(respondWith, url).not.toHaveBeenCalled();
    }
  });

  it("handles page loads (network first, offline page on failure) and hashed static files", async () => {
    const { handlers } = loadWorker();
    for (const [url, init] of [
      ["https://opetlife.ir/fa/home", { mode: "navigate" }],
      ["https://opetlife.ir/_next/static/chunks/app-1a2b.js", {}],
      ["https://opetlife.ir/brand/opl/app-icon-192.png", {}],
    ] as const) {
      const { event, respondWith } = fetchEvent(url, init);
      handlers.fetch!(event);
      expect(respondWith, url).toHaveBeenCalledTimes(1);
      const response = (await respondWith.mock.calls[0]![0]) as Response;
      expect(response.status, url).toBe(200);
    }
  });
});
