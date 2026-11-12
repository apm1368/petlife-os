"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Search, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PaginatedDto, PublicArticleSummaryDto, PublicCategoryDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { GUIDE_CATEGORY_SLUG } from "./content-sections";
import { PublicBlogArticleCard } from "./PublicBlogArticleCard";

export const ARTICLE_INDEX_PAGE_SIZE = 12;

interface IndexProps {
  categorySlug?: string;
  tagSlug?: string;
  titleOverride?: string;
  descriptionOverride?: string;
  section?: "blog" | "guides";
  /** Server-rendered first page — when present the page arrives complete (crawlable), with real page links. */
  initialPage?: PaginatedDto<PublicArticleSummaryDto>;
  initialCategories?: PublicCategoryDto[];
  pageNumber?: number;
  basePath?: string;
}

/** Blog index (spec: "featured/recent articles, category navigation, pagination, localized empty state"). */
export function PublicBlogIndexView({ categorySlug, tagSlug, titleOverride, descriptionOverride, section = "blog", initialPage, initialCategories, pageNumber: initialPageNumber = 1, basePath }: IndexProps = {}) {
  const t = useTranslations("blog.index");
  const design = useTranslations("rollout.editorial");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const locale = useLocale() as ContentLocale;

  const [page, setPage] = useState<PaginatedDto<PublicArticleSummaryDto> | null>(initialPage ?? null);
  const [categories, setCategories] = useState<PublicCategoryDto[]>((initialCategories ?? []).filter((c) => c.slug !== GUIDE_CATEGORY_SLUG));
  const [error, setError] = useState(false);
  const [pageNumber, setPageNumber] = useState(initialPageNumber);
  const generation = useRef(0);
  const serverDelivered = useRef(Boolean(initialPage));
  const [appendError, setAppendError] = useState(false);

  async function load(nextPage: number, append = false) {
    const request = ++generation.current;
    setError(false); setAppendError(false);
    if (!append) setPage(null);
    setBusy(true);
    try {
      const [articles, cats] = await Promise.all([blogService.listArticles(locale, section === "guides" ? { categorySlug: GUIDE_CATEGORY_SLUG, search: query || undefined, page: nextPage, pageSize: ARTICLE_INDEX_PAGE_SIZE } : { categorySlug, tagSlug, excludeCategorySlug: categorySlug || tagSlug ? undefined : GUIDE_CATEGORY_SLUG, search: query || undefined, page: nextPage, pageSize: ARTICLE_INDEX_PAGE_SIZE }), blogService.listCategories(locale)]);
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
    // The server already rendered this exact page; only a search (or a client-only use) loads here.
    if (serverDelivered.current && query === "") { serverDelivered.current = false; return; }
    serverDelivered.current = false;
    void load(1);
    return () => { generation.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, categorySlug, tagSlug, query, section]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => load(1)} />;

  const totalPages = page ? Math.max(1, Math.ceil(page.total / ARTICLE_INDEX_PAGE_SIZE)) : 1;
  const linkedPagination = Boolean(basePath) && query === "" && initialPage !== undefined;
  const pageHref = (n: number) => (n <= 1 ? basePath! : `${basePath}?page=${n}`);

  return (
    <div className="editorial-index">
      <header className="editorial-heading"><p>{design("eyebrow")}</p><h1>{titleOverride ?? t("title")}</h1><p>{descriptionOverride ?? design("description")}</p></header>
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
      {linkedPagination && totalPages > 1 ? (
        <nav className="editorial-pagination" aria-label={design("pageLabel", { page: pageNumber })}>
          {pageNumber > 1 ? <Link href={pageHref(pageNumber - 1)} rel="prev">{design("newer")}</Link> : <span />}
          <span>{design("pageLabel", { page: pageNumber })}</span>
          {pageNumber < totalPages ? <Link href={pageHref(pageNumber + 1)} rel="next">{design("older")}</Link> : <span />}
        </nav>
      ) : page && page.items.length < page.total && !linkedPagination ? (
        <Button variant="secondary" isLoading={busy} onClick={() => load(pageNumber + 1, true)}>
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}
