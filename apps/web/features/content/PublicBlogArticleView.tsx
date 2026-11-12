"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { Locale as ContentLocale, PublicArticleDetailDto, PublicArticleSummaryDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { GUIDE_CATEGORY_SLUG } from "./content-sections";
import { RichTextRenderer } from "./RichTextRenderer";
import { ShareBar } from "@/features/shared/ShareBar";
import { formatCount } from "@/lib/number/format-number";
import { headingAnchor, inlineToText } from "@/lib/seo/rich-text-text";
import "./editorial-design.css";

const LANGUAGE_NAMES: Record<string, string> = { fa: "فارسی", en: "English", de: "Deutsch", es: "Español" };
const DATE_LOCALE: Record<string, string> = { fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES" };

/**
 * The public article page. The server route passes `initialArticle` (and related reading), so the full
 * article — headings, body, FAQ, video — is in the first HTML response for readers, search engines and AI
 * crawlers alike; the client-side load below only runs when the view is used without server data.
 */
export function PublicBlogArticleView({ slug, section = "blog", initialArticle, initialRelated }: { slug: string; section?: "blog" | "guides"; initialArticle?: PublicArticleDetailDto; initialRelated?: PublicArticleSummaryDto[] }) {
  const t = useTranslations("blog.article");
  const design = useTranslations("rollout.editorial");
  const locale = useLocale() as ContentLocale;
  const router = useRouter();
  const generation = useRef(0);
  const [article, setArticle] = useState<PublicArticleDetailDto | null>(initialArticle ?? null);
  const [related, setRelated] = useState<PublicArticleSummaryDto[] | null>(initialRelated ?? null);
  const [relatedFailed, setRelatedFailed] = useState(false);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);

  async function loadRelated(found: PublicArticleDetailDto, request: number) {
    setRelatedFailed(false);
    try {
      const result = await blogService.listArticles(locale, { categorySlug: found.category?.slug, pageSize: 5 });
      if (request === generation.current) setRelated(result.items.filter((a) => a.id !== found.id).slice(0, 4));
    } catch { if (request === generation.current) setRelatedFailed(true); }
  }
  async function load() {
    const request = ++generation.current;
    setError(null); setArticle(null); setRelated(null); setRelatedFailed(false);
    try {
      const found = await blogService.getArticle(locale, slug);
      if (request !== generation.current) return;
      const isGuide = found.category?.slug === GUIDE_CATEGORY_SLUG;
      if (isGuide && section === "blog") return router.replace(`/${locale}/guides/${slug}`);
      if (!isGuide && section === "guides") return setError("notFound");
      setArticle(found);
      void loadRelated(found, request);
    } catch (e) { if (request === generation.current) setError(e instanceof ApiError && e.status === 404 ? "notFound" : "failed"); }
  }
  useEffect(() => {
    if (initialArticle && initialArticle.slug === slug) return; /* The server already delivered this article. */
    void load(); return () => { generation.current += 1; }; /* Data reloads on route/locale, not translator identity. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug, section]);
  if (error === "notFound") return <EmptyState title={t("notFoundTitle")} description={t("notFoundMessage")} />;
  if (error) return <ErrorRecovery title={design("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!article) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;
  const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-US", { dateStyle: "long" });
  const toc = article.body.flatMap((b) => (b.type === "heading" && b.level === 2 ? [inlineToText(b.content)] : [])).map((text, i) => ({ id: headingAnchor(i), text }));
  const sectionLabel = section === "guides" ? design("guidesLabel") : design("blogLabel");
  return <article className="editorial-article">
    <div className="editorial-article__main">
      <nav aria-label={design("breadcrumb")} className="editorial-breadcrumb">
        <Link href={locale === "fa" ? "/" : `/${locale}`}>{design("home")}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/${locale}/${section}`}>{sectionLabel}</Link>
        {article.category && section === "blog" ? <><span aria-hidden="true">/</span><Link href={`/${locale}/blog/category/${article.category.slug}`}>{article.category.name}</Link></> : null}
      </nav>
      <h1>{article.title}</h1>
      <div className="editorial-article__meta">
        {article.author ? <span>{article.author.name}</span> : null}
        {article.estimatedReadingMinutes ? <span>{design("minutes", { count: formatCount(article.estimatedReadingMinutes, locale) })}</span> : null}
        <span><time dateTime={article.publishedAt}>{t("published", { date: dateFormatter.format(new Date(article.publishedAt)) })}</time></span>
        {article.updatedAt.slice(0, 10) !== article.publishedAt.slice(0, 10) ? <span><time dateTime={article.updatedAt}>{t("updated", { date: dateFormatter.format(new Date(article.updatedAt)) })}</time></span> : null}
      </div>
      {article.coverMediaAsset ? <Image unoptimized width={article.coverMediaAsset.widthPx ?? 1600} height={article.coverMediaAsset.heightPx ?? 900} src={article.coverMediaAsset.url} alt={article.coverMediaAsset.altText ?? article.title} className="editorial-article__cover" priority /> : null}
      {toc.length >= 3 ? <nav className="editorial-toc" aria-label={design("contents")}><h2>{design("contents")}</h2><ol>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ol></nav> : null}
      <div className="editorial-article__body"><RichTextRenderer body={article.body} /></div>
    </div>
    <aside className="editorial-article__side">
      <section><h2>{design("share")}</h2><ShareBar url={article.canonicalPath} text={article.title} /></section>
      {article.translations?.length ? <section><h2>{design("otherLanguages")}</h2><div className="editorial-topics">{article.translations.map((tr) => <Link key={tr.locale} href={tr.canonicalPath} hrefLang={tr.locale} lang={tr.locale}>{LANGUAGE_NAMES[tr.locale] ?? tr.locale}</Link>)}</div></section> : null}
      {article.tags.length ? <section><h2>{design("tags")}</h2><div className="editorial-topics">{article.tags.map((tag) => <Link href={`/${locale}/blog/tag/${tag.slug}`} key={tag.id}>{tag.name}</Link>)}</div></section> : null}
      {relatedFailed ? <section role="alert"><p>{design("relatedFailed")}</p><button onClick={() => void loadRelated(article, generation.current)}>{design("retry")}</button></section> : related === null ? <Skeleton className="h-32 w-full" /> : related.length ? <section><h2>{design("related")}</h2><div className="editorial-related">{related.map((item) => <Link href={item.canonicalPath} key={item.id}>{item.coverMediaAsset ? <Image unoptimized width={72} height={64} src={item.coverMediaAsset.url} alt="" /> : null}<span>{item.title}</span></Link>)}</div></section> : null}
    </aside>
  </article>;
}
