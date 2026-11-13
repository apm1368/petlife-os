// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
// React's request-scoped `cache` only exists in the server build; a pass-through is enough here.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const { fetchArticleFeedResult, lookupArticle, resetBlogServerCache, upstreamUnavailableResponse } = await import("./blog-server");

type Route = Record<string, unknown>;
function serve(routes: Route) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}?${url.searchParams.toString()}`;
    return key in routes ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response("{}", { status: 404 });
  }));
}
const en = { locale: "en", slug: "cat-scratching-furniture", canonicalPath: "/en/blog/cat-scratching-furniture", translations: [{ locale: "fa", canonicalPath: "/fa/blog/cat-scratching-furniture" }, { locale: "de", canonicalPath: "/de/blog/katze-kratzt-moebel" }] };

describe("article lookup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a slug from another language to this article's translation in the requested language", async () => {
    serve({ "/blog/articles/cat-scratching-furniture?locale=en": en });
    await expect(lookupArticle("de", "cat-scratching-furniture")).resolves.toEqual({ kind: "moved", canonicalPath: "/de/blog/katze-kratzt-moebel" });
  });

  it("stays a 404 when the article has no translation in the requested language", async () => {
    serve({ "/blog/articles/cat-scratching-furniture?locale=en": en });
    await expect(lookupArticle("es", "cat-scratching-furniture")).resolves.toEqual({ kind: "missing" });
  });

  it("prefers the article's own renamed-slug redirect, and treats unknown slugs as missing", async () => {
    serve({ "/blog/slug-redirects/old-name?locale=de": { canonicalPath: "/de/blog/new-name" } });
    await expect(lookupArticle("de", "old-name")).resolves.toEqual({ kind: "moved", canonicalPath: "/de/blog/new-name" });
    await expect(lookupArticle("de", "never-existed")).resolves.toEqual({ kind: "missing" });
  });
});

describe("slow or failing API", () => {
  afterEach(() => { vi.unstubAllGlobals(); resetBlogServerCache(); });
  const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

  it("retries a timed-out read once before giving up", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(new Response(JSON.stringify(en), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupArticle("en", "cat-scratching-furniture")).resolves.toEqual({ kind: "found", article: en });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last good answer when the API fails twice", async () => {
    serve({ "/blog/articles/cat-scratching-furniture?locale=en": en });
    await lookupArticle("en", "cat-scratching-furniture");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout()));
    await expect(lookupArticle("en", "cat-scratching-furniture")).resolves.toEqual({ kind: "found", article: en });
  });

  it("reports the feed unavailable (for a 503) instead of an empty 200 when nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 502 })));
    await expect(fetchArticleFeedResult()).resolves.toEqual({ items: [], unavailable: true });
    const res = upstreamUnavailableResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
  });

  it("does not retry a 4xx answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupArticle("en", "bad-request")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
