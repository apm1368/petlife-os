"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PaginatedDto, PublicArticleSummaryDto, PublicCategoryDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { PublicBlogArticleCard } from "./PublicBlogArticleCard";

/** Blog index (spec: "featured/recent articles, category navigation, pagination, localized empty state"). */
export function PublicBlogIndexView({ categorySlug, tagSlug, titleOverride }: { categorySlug?: string; tagSlug?: string; titleOverride?: string } = {}) {
  const t = useTranslations("blog.index");
  const locale = useLocale() as ContentLocale;

  const [page, setPage] = useState<PaginatedDto<PublicArticleSummaryDto> | null>(null);
  const [categories, setCategories] = useState<PublicCategoryDto[]>([]);
  const [error, setError] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

  async function load(nextPage: number, append = false) {
    setError(false);
    try {
      const [articles, cats] = await Promise.all([blogService.listArticles(locale, { categorySlug, tagSlug, page: nextPage, pageSize: 12 }), categories.length === 0 ? blogService.listCategories(locale) : Promise.resolve(categories)]);
      setPage((prev) => (append && prev ? { ...articles, items: [...prev.items, ...articles.items] } : articles));
      setCategories(cats);
      setPageNumber(nextPage);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, categorySlug, tagSlug]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(1)} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{titleOverride ?? t("title")}</h1>

      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/blog`} className="rounded-full border border-border-strong px-3 py-1 text-metadata text-text-secondary">
            {t("allCategories")}
          </Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/${locale}/blog/category/${c.slug}`} className="rounded-full border border-border-strong px-3 py-1 text-metadata text-text-secondary">
              {c.name}
            </Link>
          ))}
        </div>
      ) : null}

      {!page ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : page.items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((article) => (
            <PublicBlogArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {page && page.items.length < page.total ? (
        <Button variant="secondary" onClick={() => load(pageNumber + 1, true)}>
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
