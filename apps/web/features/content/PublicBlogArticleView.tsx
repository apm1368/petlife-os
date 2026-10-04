"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { Locale as ContentLocale, PublicArticleDetailDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { GUIDE_CATEGORY_SLUG } from "./content-sections";
import { RichTextRenderer } from "./RichTextRenderer";

/** The article page (spec: "title, excerpt, cover, author, updated/published time, rendered body, category/tags"). No AI recommendations — "related navigation" is deliberately out of scope this phase (see README). */
export function PublicBlogArticleView({ slug, section = "blog" }: { slug: string; section?: "blog" | "guides" }) {
  const t = useTranslations("blog.article");
  const locale = useLocale() as ContentLocale;
  const router = useRouter();

  const [article, setArticle] = useState<PublicArticleDetailDto | null>(null);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);

  async function load() {
    setError(null);
    setArticle(null);
    try {
      const found = await blogService.getArticle(locale, slug);
      const isGuide = found.category?.slug === GUIDE_CATEGORY_SLUG;
      // Each article lives in exactly one section: a guide opened under /blog moves to /guides, and
      // /guides never shows a blog post.
      if (isGuide && section === "blog") return router.replace(`/${locale}/guides/${slug}`);
      if (!isGuide && section === "guides") return setError("notFound");
      setArticle(found);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);

  // A missing article is final — no retry button for something that does not exist.
  if (error === "notFound") return <EmptyState title={t("notFoundTitle")} description={t("notFoundMessage")} />;
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
