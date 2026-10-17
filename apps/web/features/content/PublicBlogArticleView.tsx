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
import "./editorial-design.css";

export function PublicBlogArticleView({ slug, section = "blog" }: { slug: string; section?: "blog" | "guides" }) {
  const t = useTranslations("blog.article");
  const design = useTranslations("rollout.editorial");
  const locale = useLocale() as ContentLocale;
  const router = useRouter();
  const generation = useRef(0);
  const [article, setArticle] = useState<PublicArticleDetailDto | null>(null);
  const [related, setRelated] = useState<PublicArticleSummaryDto[] | null>(null);
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
  useEffect(() => { void load(); return () => { generation.current += 1; }; /* Data reloads on route/locale, not translator identity. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug, section]);
  if (error === "notFound") return <EmptyState title={t("notFoundTitle")} description={t("notFoundMessage")} />;
  if (error) return <ErrorRecovery title={design("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!article) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;
  const dateFormatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "long" });
  return <article className="editorial-article">
    <div className="editorial-article__main">
      <Link href={`/${locale}/${section}`}>{design("back")}</Link>
      {article.category ? <span className="editorial-card__category">{article.category.name}</span> : null}
      <h1>{article.title}</h1>
      <div className="editorial-article__meta">
        {article.author ? <span>{article.author.name}</span> : null}
        {article.estimatedReadingMinutes ? <span>{design("minutes", { count: formatCount(article.estimatedReadingMinutes, locale) })}</span> : null}
        <span>{t("published", { date: dateFormatter.format(new Date(article.publishedAt)) })}</span>
        {article.updatedAt !== article.publishedAt ? <span>{t("updated", { date: dateFormatter.format(new Date(article.updatedAt)) })}</span> : null}
      </div>
      {article.coverMediaAsset ? <Image unoptimized width={1400} height={850} src={article.coverMediaAsset.url} alt={article.coverMediaAsset.altText ?? article.title} className="editorial-article__cover" priority /> : null}
      <div className="editorial-article__body"><RichTextRenderer body={article.body} /></div>
    </div>
    <aside className="editorial-article__side">
      <section><h2>{design("share")}</h2><ShareBar url={article.canonicalPath} text={article.title} /></section>
      {article.tags.length ? <section><h2>{design("tags")}</h2><div className="editorial-topics">{article.tags.map((tag) => <Link href={`/${locale}/blog/tag/${tag.slug}`} key={tag.id}>{tag.name}</Link>)}</div></section> : null}
      {relatedFailed ? <section role="alert"><p>{design("relatedFailed")}</p><button onClick={() => void loadRelated(article, generation.current)}>{design("retry")}</button></section> : related === null ? <Skeleton className="h-32 w-full" /> : related.length ? <section><h2>{design("related")}</h2><div className="editorial-related">{related.map((item) => <Link href={item.canonicalPath} key={item.id}>{item.coverMediaAsset ? <Image unoptimized width={72} height={64} src={item.coverMediaAsset.url} alt="" /> : null}<span>{item.title}</span></Link>)}</div></section> : null}
    </aside>
  </article>;
}
