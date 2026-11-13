import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { fetchArticleFeed } from "@/lib/seo/blog-server";
import { articleEntries } from "@/lib/seo/sitemap-entries";
import { publicPagePath, SITE_ORIGIN, sitemapPages } from "@/lib/seo/public-metadata";

/** Rebuilt at most every five minutes, so a newly published article is listed within minutes. */
export const revalidate = 300;

const absolute = (path: string) => new URL(path, SITE_ORIGIN).toString();

/**
 * Stable public routes in all four locales, plus every published article locale with its hreflang
 * siblings, cover image and video. User records, private routes, and currently empty/unpublished shop,
 * help, legal and insurance pages are deliberately omitted.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const feed = await fetchArticleFeed();
  // An article index is only listed once it has articles; empty indexes are noindex and must not be in the sitemap.
  const hasGuides = feed.some((item) => item.categorySlug === "guides");
  const hasBlog = feed.some((item) => item.categorySlug !== "guides");
  const listed = sitemapPages.filter((page) => (page === "guides" ? hasGuides : page === "blog" ? hasBlog : true));
  const pages: MetadataRoute.Sitemap = listed.flatMap((page) => locales.map((locale) => ({
    url: absolute(publicPagePath(locale, page)),
    changeFrequency: page === "blog" || page === "guides" ? ("daily" as const) : ("weekly" as const),
    priority: page === "home" ? 1 : page === "blog" || page === "guides" ? 0.8 : 0.6,
    alternates: {
      languages: Object.fromEntries([
        ...locales.map((language) => [language, absolute(publicPagePath(language, page))]),
        ["x-default", absolute(publicPagePath("fa", page))],
      ]),
    },
  })));
  return [...pages, ...articleEntries(feed)];
}
