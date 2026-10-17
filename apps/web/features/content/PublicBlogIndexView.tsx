"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Search, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PaginatedDto, PublicArticleSummaryDto, PublicCategoryDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { GUIDE_CATEGORY_SLUG } from "./content-sections";
import { PublicBlogArticleCard } from "./PublicBlogArticleCard";

/** Blog index (spec: "featured/recent articles, category navigation, pagination, localized empty state"). */
export function PublicBlogIndexView({ categorySlug, tagSlug, titleOverride, section = "blog" }: { categorySlug?: string; tagSlug?: string; titleOverride?: string; section?: "blog" | "guides" } = {}) {
  const t = useTranslations("blog.index");
  const design = useTranslations("rollout.editorial");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const locale = useLocale() as ContentLocale;

  const [page, setPage] = useState<PaginatedDto<PublicArticleSummaryDto> | null>(null);
  const [categories, setCategories] = useState<PublicCategoryDto[]>([]);
  const [error, setError] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const generation = useRef(0);
  const [appendError, setAppendError] = useState(false);

  async function load(nextPage: number, append = false) {
    const request = ++generation.current;
    setError(false); setAppendError(false);
    if (!append) setPage(null);
    setBusy(true);
    try {
      const [articles, cats] = await Promise.all([blogService.listArticles(locale, section === "guides" ? { categorySlug: GUIDE_CATEGORY_SLUG, search: query || undefined, page: nextPage, pageSize: 12 } : { categorySlug, tagSlug, excludeCategorySlug: categorySlug || tagSlug ? undefined : GUIDE_CATEGORY_SLUG, search: query || undefined, page: nextPage, pageSize: 12 }), blogService.listCategories(locale)]);
      if (request !== generation.current) return;
      setPage((prev) => (append && prev ? { ...articles, items: [...prev.items, ...articles.items] } : articles));
      // Guides are their own section; the blog's category strip never lists them.
      setCategories(cats.filter((c) => c.slug !== GUIDE_CATEGORY_SLUG));
      setPageNumber(nextPage);
    } catch {
      if (request === generation.current) { if (append) setAppendError(true); else setError(true); }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load(1);
    return () => { generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, categorySlug, tagSlug, query, section]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(1)} />;

  return (
    <div className="editorial-index">
      <header className="editorial-heading"><p>{design("eyebrow")}</p><h1>{titleOverride ?? t("title")}</h1><p>{design("description")}</p></header>
      <form className="editorial-search" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}><Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor="article-query">{design("search")}</label><input id="article-query" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={design("search")} /><Button type="submit" disabled={busy}>{design("searchButton")}</Button></form>

      {section === "blog" && categories.length > 0 ? (
        <div className="editorial-topics">
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
        <div className="editorial-grid">
          {page.items.map((article) => (
            <PublicBlogArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {appendError ? <p role="alert">{design("loadFailed")}</p> : null}
      {page && page.items.length < page.total ? (
        <Button variant="secondary" isLoading={busy} onClick={() => load(pageNumber + 1, true)}>
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
