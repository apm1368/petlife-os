import type { PublicArticleDetailDto, RichTextBlock } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";
import { inlineToText, richTextWordCount } from "./rich-text-text";
import { LANGUAGE_TAG, SITE_LOGO_PATH, SITE_NAME, SITE_ORIGIN, absoluteUrl, localeHomePath } from "./site";
import { localizedAuthorName } from "../content/author-name";

const BLOG_LABEL: Record<RouteLocale, string> = { fa: "مجله", en: "Magazine", de: "Magazin", es: "Revista" };
const GUIDES_LABEL: Record<RouteLocale, string> = { fa: "راهنماها", en: "Guides", de: "Ratgeber", es: "Guías" };

function isoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `PT${m ? `${m}M` : ""}${s || !m ? `${s}S` : ""}`;
}

/**
 * Structured data for one article: BlogPosting + BreadcrumbList, plus FAQPage and VideoObject when the body
 * has an FAQ or a video. Everything is taken from what the page visibly shows — no invented ratings,
 * authors or dates — so search engines and AI answer engines can cite the page with confidence.
 */
export function articleJsonLd(locale: RouteLocale, article: PublicArticleDetailDto) {
  const url = absoluteUrl(article.canonicalPath);
  const section = article.canonicalPath.split("/")[2] === "guides" ? "guides" : "blog";
  const sectionUrl = absoluteUrl(`/${locale}/${section}`);
  const image = article.coverMediaAsset?.url ? [article.coverMediaAsset.url] : [absoluteUrl(SITE_LOGO_PATH)];
  const videos = article.body.filter((b): b is Extract<RichTextBlock, { type: "video" }> => b.type === "video" && Boolean(b.url));
  const faqs = article.body.filter((b): b is Extract<RichTextBlock, { type: "faq" }> => b.type === "faq").flatMap((b) => b.items);
  const summary = article.body.find((b) => b.type === "callout");

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "opetlife",
    alternateName: "اپت‌لایف",
    url: `${SITE_ORIGIN}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl(SITE_LOGO_PATH) },
  };

  const videoNodes = videos.map((video, i) => ({
    "@type": "VideoObject",
    "@id": `${url}#video-${i + 1}`,
    name: video.title,
    description: video.description ?? video.caption ?? article.seoDescription ?? article.excerpt ?? article.title,
    thumbnailUrl: [video.posterUrl ?? image[0]],
    contentUrl: video.url,
    uploadDate: article.publishedAt,
    inLanguage: LANGUAGE_TAG[locale],
    ...(video.durationSeconds ? { duration: isoDuration(video.durationSeconds) } : {}),
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  }));

  const posting: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: article.title.slice(0, 110),
    description: article.seoDescription ?? article.excerpt ?? undefined,
    abstract: summary && summary.type === "callout" ? inlineToText(summary.content) : undefined,
    image,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    inLanguage: LANGUAGE_TAG[locale],
    author: article.author ? { "@type": "Organization", name: localizedAuthorName(article.author.name, locale), url: `${SITE_ORIGIN}/` } : { "@id": `${SITE_ORIGIN}/#organization` },
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    isPartOf: { "@type": "Blog", "@id": `${sectionUrl}#blog`, name: `${section === "guides" ? GUIDES_LABEL[locale] : BLOG_LABEL[locale]} ${SITE_NAME[locale]}`, url: sectionUrl },
    articleSection: article.category?.name,
    keywords: article.tags.map((t) => t.name).join(", ") || undefined,
    wordCount: richTextWordCount(article.body),
    ...(article.estimatedReadingMinutes ? { timeRequired: `PT${article.estimatedReadingMinutes}M` } : {}),
    ...(videoNodes.length ? { video: videoNodes.map((v) => ({ "@id": v["@id"] })) } : {}),
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".editorial-article__main h1", ".editorial-summary"] },
    ...(article.translations?.length ? { workTranslation: article.translations.map((t) => ({ "@type": "BlogPosting", "@id": `${absoluteUrl(t.canonicalPath)}#article`, inLanguage: LANGUAGE_TAG[t.locale as RouteLocale] ?? t.locale })) } : {}),
  };

  const crumbs = [
    { name: SITE_NAME[locale], item: absoluteUrl(localeHomePath(locale)) },
    { name: section === "guides" ? GUIDES_LABEL[locale] : BLOG_LABEL[locale], item: sectionUrl },
    ...(article.category && section === "blog" ? [{ name: article.category.name, item: absoluteUrl(`/${locale}/blog/category/${article.category.slug}`) }] : []),
    { name: article.title, item: url },
  ];
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: crumbs.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: crumb.item })),
  };

  const graph: Record<string, unknown>[] = [organization, posting, breadcrumb, ...videoNodes];
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      inLanguage: LANGUAGE_TAG[locale],
      mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: inlineToText(faq.answer) } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** ItemList structured data for an article index page. */
export function articleListJsonLd(locale: RouteLocale, pageUrl: string, name: string, items: { canonicalPath: string; title: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${pageUrl}#page`,
    url: pageUrl,
    name,
    inLanguage: LANGUAGE_TAG[locale],
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(item.canonicalPath), name: item.title })),
    },
  };
}
