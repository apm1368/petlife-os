import { isRouteLocale } from "@/lib/i18n/config";
import { fetchArticleFeed } from "@/lib/seo/blog-server";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { LANGUAGE_TAG, absoluteUrl } from "@/lib/seo/site";

export const revalidate = 300;

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of the newest articles in one language (/fa/feed.xml, /en/feed.xml, …). */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isRouteLocale(locale)) return new Response("Not found", { status: 404 });
  const items = (await fetchArticleFeed({ locale })).slice(0, 50);
  const meta = publicPageMetadata(locale, "blog");
  const channelUrl = absoluteUrl(`/${locale}/blog`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeXml(String(meta.title))}</title>
<link>${channelUrl}</link>
<description>${escapeXml(String(meta.description))}</description>
<language>${LANGUAGE_TAG[locale]}</language>
<atom:link href="${absoluteUrl(`/${locale}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items.map((item) => `<item>
<title>${escapeXml(item.title)}</title>
<link>${absoluteUrl(item.canonicalPath)}</link>
<guid isPermaLink="true">${absoluteUrl(item.canonicalPath)}</guid>
<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
${item.categoryName ? `<category>${escapeXml(item.categoryName)}</category>\n` : ""}<description>${escapeXml(item.seoDescription ?? item.excerpt ?? "")}</description>
${item.coverUrl ? `<enclosure url="${escapeXml(item.coverUrl)}" type="${item.coverUrl.endsWith(".png") ? "image/png" : item.coverUrl.endsWith(".jpg") ? "image/jpeg" : "image/webp"}" length="0"/>\n` : ""}</item>`).join("\n")}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
