import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/config";
import { publicPagePath, SITE_ORIGIN, sitemapPages } from "@/lib/seo/public-metadata";
import { vi } from "vitest";
import sitemap from "./sitemap";
import { articleEntries } from "@/lib/seo/sitemap-entries";

vi.mock("@/lib/seo/blog-server", () => ({ fetchArticleFeed: async () => [] }));

describe("public sitemap", () => {
  it("lists only the configured public routes in all four locales with reciprocal alternates", async () => {
    const entries = await sitemap();
    expect(entries).toHaveLength(sitemapPages.length * locales.length);

    for (const page of sitemapPages) {
      for (const locale of locales) {
        const expectedUrl = new URL(publicPagePath(locale, page), SITE_ORIGIN).toString();
        const entry = entries.find((item) => item.url === expectedUrl);
        expect(entry).toBeDefined();
        expect(entry?.alternates?.languages).toMatchObject({
          fa: new URL(publicPagePath("fa", page), SITE_ORIGIN).toString(),
          en: new URL(publicPagePath("en", page), SITE_ORIGIN).toString(),
          de: new URL(publicPagePath("de", page), SITE_ORIGIN).toString(),
          es: new URL(publicPagePath("es", page), SITE_ORIGIN).toString(),
          "x-default": new URL(publicPagePath("fa", page), SITE_ORIGIN).toString(),
        });
      }
    }
  });

  it("does not expose authenticated, tokenized, or empty/unpublished page families", async () => {
    const urls = (await sitemap()).map(({ url }) => url);
    expect(urls.some((url) => /\/(admin|profile|pets|provider|seller|checkout|orders|health-share|pet-card)(\/|$)/.test(url))).toBe(false);
    expect(urls.some((url) => /\/(shop|help|legal|insurance)(\/|$)/.test(url))).toBe(false);
  });

  it("lists each published article locale with its translations, cover and video", () => {
    const base = { articleId: "a1", excerpt: null, seoDescription: "d", categorySlug: null, categoryName: null, tags: [], coverAlt: null, publishedAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" };
    const entries = articleEntries([
      { ...base, locale: "fa", slug: "puppy-biting", canonicalPath: "/fa/blog/puppy-biting", title: "t", coverUrl: "https://opetlife.ir/api/uploads/c.webp", videos: [{ url: "https://opetlife.ir/api/uploads/v.mp4", posterUrl: null, title: "v", description: null, durationSeconds: 24 }] },
      { ...base, locale: "de", slug: "welpe-beisst", canonicalPath: "/de/blog/welpe-beisst", title: "t", coverUrl: null, videos: [] },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.url).toBe("https://opetlife.ir/fa/blog/puppy-biting");
    expect(entries[0]?.alternates?.languages).toEqual({ fa: "https://opetlife.ir/fa/blog/puppy-biting", de: "https://opetlife.ir/de/blog/welpe-beisst", "x-default": "https://opetlife.ir/fa/blog/puppy-biting" });
    expect(entries[0]?.images).toEqual(["https://opetlife.ir/api/uploads/c.webp"]);
    expect(entries[0]?.videos?.[0]?.content_loc).toBe("https://opetlife.ir/api/uploads/v.mp4");
    expect(entries[1]?.images).toBeUndefined();
  });
});
