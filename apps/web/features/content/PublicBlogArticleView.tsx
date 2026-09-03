"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PublicArticleDetailDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { RichTextRenderer } from "./RichTextRenderer";

/** The article page (spec: "title, excerpt, cover, author, updated/published time, rendered body, category/tags"). No AI recommendations — "related navigation" is deliberately out of scope this phase (see README). */
export function PublicBlogArticleView({ slug }: { slug: string }) {
  const t = useTranslations("blog.article");
  const locale = useLocale() as ContentLocale;

  const [article, setArticle] = useState<PublicArticleDetailDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setArticle(null);
    try {
      setArticle(await blogService.getArticle(locale, slug));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);

  if (error) return <ErrorRecovery title={t("notFoundTitle")} message={t("notFoundMessage")} retryLabel={t("retry")} onRetry={load} />;
  if (!article) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  const dateFormatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "long" });

  return (
    <article className="flex flex-col gap-4">
      {article.category ? <span className="text-metadata text-brand-natural">{article.category.name}</span> : null}
      <h1 className="text-page-title text-text-primary">{article.title}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-metadata text-text-secondary">
        {article.author ? <span>{article.author.name}</span> : null}
        <span>{t("published", { date: dateFormatter.format(new Date(article.publishedAt)) })}</span>
        {article.updatedAt !== article.publishedAt ? <span>{t("updated", { date: dateFormatter.format(new Date(article.updatedAt)) })}</span> : null}
      </div>
      {article.coverMediaAsset ? <img src={article.coverMediaAsset.url} alt={article.coverMediaAsset.altText ?? article.title} className="w-full rounded-md" /> : null}

      <RichTextRenderer body={article.body} />

      {article.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {article.tags.map((tag) => (
            <span key={tag.id} className="rounded-full border border-border-strong px-3 py-1 text-metadata text-text-secondary">
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
