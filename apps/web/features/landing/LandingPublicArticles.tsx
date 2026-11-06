"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Locale as ContentLocale, PaginatedDto, PublicArticleSummaryDto } from "@petlife/types";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { blogService } from "@/services/blog.service";
import { PublicBlogArticleCard } from "@/features/content/PublicBlogArticleCard";

export interface LandingArticlesCopy {
  eyebrow: string;
  title: string;
  allArticles: string;
  empty: string;
  loadError: string;
  retry: string;
}

export function LandingPublicArticles({ locale, copy }: { locale: ContentLocale; copy: LandingArticlesCopy }) {
  const [articles, setArticles] = useState<PublicArticleSummaryDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  async function load() {
    const currentRequest = ++request.current;
    setFailed(false);
    setArticles(null);
    try {
      const result: PaginatedDto<PublicArticleSummaryDto> = await blogService.listArticles(locale, {
        page: 1,
        pageSize: 3,
        excludeCategorySlug: "guides",
      });
      if (currentRequest === request.current) setArticles(result.items);
    } catch {
      if (currentRequest === request.current) setFailed(true);
    }
  }

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
    // This section is scoped to the locale passed by the localized landing route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <section className="park-public-articles" aria-labelledby="park-public-articles-title">
      <div className="park-section-heading">
        <p className="park-eyebrow">{copy.eyebrow}</p>
        <h2 id="park-public-articles-title">{copy.title}</h2>
      </div>
      {failed ? (
        <ErrorRecovery title={copy.title} message={copy.loadError} retryLabel={copy.retry} onRetry={() => void load()} />
      ) : articles === null ? (
        <div className="park-public-articles__grid" aria-label={copy.title}>
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-64 w-full" aria-label={copy.title} />)}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState title={copy.empty} />
      ) : (
        <div className="park-public-articles__grid">
          {articles.map((article) => <PublicBlogArticleCard key={article.id} article={article} />)}
        </div>
      )}
      <Link className="park-public-articles__all" href={`/${locale}/blog`}>{copy.allArticles}</Link>
    </section>
  );
}
