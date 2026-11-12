// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
// React's request-scoped `cache` only exists in the server build; a pass-through is enough here.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const { lookupArticle } = await import("./blog-server");

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
