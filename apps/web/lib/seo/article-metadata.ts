import type { Metadata } from "next";
import type { PublicArticleDetailDto } from "@petlife/types";
import { locales, type RouteLocale } from "@/lib/i18n/config";
import { OG_LOCALE, SITE_NAME, SITE_ORIGIN, SITE_SHARE_IMAGE_PATH } from "./site";

/** Robots directives for pages we want fully previewed — long snippets and large images help both search results and AI citations. */
export const RICH_INDEX_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
};

export function articleMetadata(locale: RouteLocale, article: PublicArticleDetailDto): Metadata {
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt || undefined;
  const languages: Record<string, string> = { [locale]: article.canonicalPath };
  for (const translation of article.translations ?? []) languages[translation.locale] = translation.canonicalPath;
  // x-default: the Persian original when it exists, otherwise this page.
  languages["x-default"] = languages.fa ?? article.canonicalPath;
  const cover = article.coverMediaAsset;
  const images = cover?.url
    ? [{ url: cover.url, alt: cover.altText ?? article.title, ...(cover.widthPx ? { width: cover.widthPx } : {}), ...(cover.heightPx ? { height: cover.heightPx } : {}) }]
    : [{ url: SITE_SHARE_IMAGE_PATH, alt: SITE_NAME[locale] }];
  const video = article.body.find((b) => b.type === "video" && b.url);

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title,
    description,
    keywords: article.tags.map((t) => t.name),
    authors: article.author ? [{ name: article.author.name }] : [{ name: SITE_NAME[locale] }],
    category: article.category?.name,
    robots: RICH_INDEX_ROBOTS,
    alternates: { canonical: article.canonicalPath, languages, types: { "application/rss+xml": `/${locale}/feed.xml` } },
    openGraph: {
      type: "article",
      siteName: SITE_NAME[locale],
      url: article.canonicalPath,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: (article.translations ?? []).map((t) => OG_LOCALE[t.locale as RouteLocale]).filter(Boolean),
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      section: article.category?.name,
      tags: article.tags.map((t) => t.name),
      images,
      ...(video && video.type === "video" && video.url ? { videos: [{ url: video.url, type: video.mimeType ?? "video/mp4" }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

/** Metadata for an article index (blog, guides, a category or a tag) that exists under the same suffix in each locale. */
export function articleIndexMetadata(locale: RouteLocale, options: { suffix: string; title: string; description: string; indexable: boolean; page?: number; availableIn?: RouteLocale[] }): Metadata {
  const path = (language: RouteLocale) => `/${language}/${options.suffix}`;
  const pageQuery = options.page && options.page > 1 ? `?page=${options.page}` : "";
  const languagesFor = options.availableIn ?? [...locales];
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: options.page && options.page > 1 ? `${options.title} (${options.page})` : options.title,
    description: options.description,
    robots: options.indexable ? RICH_INDEX_ROBOTS : { index: false, follow: true },
    alternates: options.indexable
      ? {
          canonical: `${path(locale)}${pageQuery}`,
          languages: { ...Object.fromEntries(languagesFor.map((language) => [language, path(language)])), "x-default": path(languagesFor.includes("fa") ? "fa" : locale) },
          types: { "application/rss+xml": `/${locale}/feed.xml` },
        }
      : undefined,
    openGraph: { type: "website", siteName: SITE_NAME[locale], url: path(locale), title: options.title, description: options.description, locale: OG_LOCALE[locale], images: [{ url: SITE_SHARE_IMAGE_PATH, alt: SITE_NAME[locale] }] },
    twitter: { card: "summary_large_image", title: options.title, description: options.description },
  };
}
