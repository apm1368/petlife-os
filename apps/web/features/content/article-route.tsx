import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { isRouteLocale, type RouteLocale } from "@/lib/i18n/config";
import { ARTICLE_SLUG_PATTERN, fetchRelatedArticles, lookupArticle } from "@/lib/seo/blog-server";
import { articleMetadata } from "@/lib/seo/article-metadata";
import { articleJsonLd } from "@/lib/seo/article-jsonld";
import { jsonLdScript } from "@/lib/seo/site";
import { PublicBlogArticleView } from "./PublicBlogArticleView";

type Section = "blog" | "guides";

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

/**
 * Server-side resolution of an article URL — one address per article locale:
 * - a slug in the wrong case permanently redirects to the lowercase one;
 * - a renamed article's old slug permanently redirects to its current address;
 * - an article requested under the wrong section (/blog vs /guides) permanently redirects to its canonical path;
 * - anything unpublished or unknown is a real 404 (never a soft "not found" page with status 200).
 */
async function resolveArticle(localeParam: string, rawSlug: string, section: Section) {
  if (!isRouteLocale(localeParam)) notFound();
  const locale: RouteLocale = localeParam;
  const slug = decodeSlug(rawSlug);
  if (!ARTICLE_SLUG_PATTERN.test(slug)) {
    const lowered = slug.toLowerCase();
    if (ARTICLE_SLUG_PATTERN.test(lowered)) permanentRedirect(`/${locale}/${section}/${lowered}`);
    notFound();
  }
  const result = await lookupArticle(locale, slug);
  if (result.kind === "moved") permanentRedirect(result.canonicalPath);
  if (result.kind === "missing") notFound();
  if (result.article.canonicalPath !== `/${locale}/${section}/${slug}`) permanentRedirect(result.article.canonicalPath);
  return { locale, slug, article: result.article };
}

export async function articleRouteMetadata(params: Promise<{ locale: string; slug: string }>, section: Section): Promise<Metadata> {
  const { locale, slug: rawSlug } = await params;
  if (!isRouteLocale(locale)) return { robots: { index: false, follow: false } };
  const slug = decodeSlug(rawSlug);
  if (!ARTICLE_SLUG_PATTERN.test(slug)) return { robots: { index: false, follow: true } };
  const result = await lookupArticle(locale, slug);
  if (result.kind !== "found" || result.article.canonicalPath !== `/${locale}/${section}/${slug}`) return { robots: { index: false, follow: true } };
  return articleMetadata(locale, result.article);
}

export async function ArticleRoute({ params, section }: { params: Promise<{ locale: string; slug: string }>; section: Section }) {
  const { locale: localeParam, slug: rawSlug } = await params;
  const { locale, slug, article } = await resolveArticle(localeParam, rawSlug, section);
  const related = await fetchRelatedArticles(locale, slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(locale, article)) }} />
      <PublicBlogArticleView slug={slug} section={section} initialArticle={article} initialRelated={related} />
    </>
  );
}
