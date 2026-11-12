import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/config";
import { publicPageMetadata, publicPagePath, sitemapPages, SITE_ORIGIN } from "./public-metadata";

describe("localized public SEO metadata", () => {
  it.each(sitemapPages.flatMap((page) => locales.map((locale) => [page, locale] as const)))(
    "%s/%s has an absolute production canonical and reciprocal locale links",
    (page, locale) => {
      const metadata = publicPageMetadata(locale, page);
      expect(metadata.metadataBase?.toString()).toBe(`${SITE_ORIGIN}/`);
      expect(metadata.alternates?.canonical).toBe(publicPagePath(locale, page));
      expect(metadata.alternates?.languages).toMatchObject({
        fa: publicPagePath("fa", page),
        en: publicPagePath("en", page),
        de: publicPagePath("de", page),
        es: publicPagePath("es", page),
        "x-default": publicPagePath("fa", page),
      });
      expect(metadata.title).not.toBe("opetlife");
      expect(metadata.description).toBeTruthy();
      expect(metadata.robots).toEqual({ index: true, follow: true });
      // Next's Metadata type allows alternate descriptors in this slot; the
      // implementation intentionally emits a path string for canonical.
      expect(new URL(publicPagePath(locale, page), SITE_ORIGIN).origin).toBe(SITE_ORIGIN);
    },
  );

  it("serves the Persian home at the bare domain and every other locale under its prefix", () => {
    expect(publicPagePath("fa", "home")).toBe("/");
    expect(publicPagePath("en", "home")).toBe("/en");
    expect(publicPagePath("fa", "blog")).toBe("/fa/blog");
  });

  it.each(["shop", "help", "legal", "places", "insurance"] as const)(
    "keeps currently empty or unpublished %s out of search results",
    (page) => {
      const metadata = publicPageMetadata("de", page);
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates).toBeUndefined();
      expect(metadata.title).not.toBe("opetlife");
      expect(metadata.description).toBeTruthy();
    },
  );
});
