import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/config";
import { publicPagePath, SITE_ORIGIN, sitemapPages } from "@/lib/seo/public-metadata";
import sitemap from "./sitemap";

describe("public sitemap", () => {
  it("lists only the configured public routes in all four locales with reciprocal alternates", () => {
    const entries = sitemap();
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

  it("does not expose authenticated, tokenized, or empty/unpublished page families", () => {
    const urls = sitemap().map(({ url }) => url);
    expect(urls.some((url) => /\/(admin|profile|pets|provider|seller|checkout|orders|health-share|pet-card)(\/|$)/.test(url))).toBe(false);
    expect(urls.some((url) => /\/(shop|help|legal|blog|insurance)(\/|$)/.test(url))).toBe(false);
  });
});
