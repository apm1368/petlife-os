import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { publicPagePath, SITE_ORIGIN, sitemapPages } from "@/lib/seo/public-metadata";

/**
 * Only stable, public routes go in the sitemap. User records, private routes,
 * and currently empty/unpublished shop, help, legal, blog and insurance pages
 * are deliberately omitted.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPages.flatMap((page) => locales.map((locale) => ({
    url: new URL(publicPagePath(locale, page), SITE_ORIGIN).toString(),
    alternates: {
      languages: Object.fromEntries([
        ...locales.map((language) => [language, new URL(publicPagePath(language, page), SITE_ORIGIN).toString()]),
        ["x-default", new URL(publicPagePath("fa", page), SITE_ORIGIN).toString()],
      ]),
    },
  })));
}
