import type { MetadataRoute } from "next";
import type { PublicArticleFeedItemDto } from "@petlife/types";
import { SITE_LOGO_PATH, SITE_ORIGIN } from "./site";

const absolute = (path: string) => new URL(path, SITE_ORIGIN).toString();

/** Sitemap entries for published article locales: hreflang siblings, last change, cover image and video. */
export function articleEntries(feed: PublicArticleFeedItemDto[]): MetadataRoute.Sitemap {
  const byArticle = new Map<string, PublicArticleFeedItemDto[]>();
  for (const item of feed) byArticle.set(item.articleId, [...(byArticle.get(item.articleId) ?? []), item]);
  return feed.map((item) => {
    const siblings = byArticle.get(item.articleId) ?? [item];
    const languages: Record<string, string> = Object.fromEntries(siblings.map((s) => [s.locale, absolute(s.canonicalPath)]));
    if (siblings.length > 1) languages["x-default"] = languages.fa ?? absolute(item.canonicalPath);
    return {
      url: absolute(item.canonicalPath),
      lastModified: new Date(item.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
      alternates: { languages },
      ...(item.coverUrl ? { images: [item.coverUrl] } : {}),
      ...(item.videos.length
        ? { videos: item.videos.map((video) => ({ title: video.title, description: video.description ?? item.seoDescription ?? item.excerpt ?? item.title, thumbnail_loc: video.posterUrl ?? item.coverUrl ?? absolute(SITE_LOGO_PATH), content_loc: video.url, ...(video.durationSeconds ? { duration: video.durationSeconds } : {}), publication_date: item.publishedAt })) }
        : {}),
    };
  });
}
