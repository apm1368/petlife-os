"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ArticleLifecycleStatus } from "@petlife/types";
import type { AdminArticleListItemDto, Locale, PaginatedDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";
import { articleStatusTone } from "./content-tone";

/** Article list (spec: "search, status filter, locale availability, category, author, updated date, sort"). Category/author filtering by free ID input this phase — no separate picker UI, kept minimal. */
export function AdminContentArticleListView() {
  const t = useTranslations("admin.content.list");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [items, setItems] = useState<PaginatedDto<AdminArticleListItemDto> | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ArticleLifecycleStatus | "">("");
  const [localeFilter, setLocaleFilter] = useState<Locale | "">("");

  async function load() {
    setError(false);
    try {
      setItems(await adminContentService.listArticles({ search: search || undefined, status: status || undefined, locale: localeFilter || undefined, pageSize: 50 }));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <Button onClick={() => router.push(`/${locale}/admin/content/new`)}>{t("newArticle")}</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label={t("statusFilter")}
          value={status}
          onChange={(e) => setStatus(e.target.value as ArticleLifecycleStatus | "")}
          options={[{ value: "", label: t("any") }, ...Object.values(ArticleLifecycleStatus).map((s) => ({ value: s, label: t(`status.${s}`) }))]}
        />
        <Select
          label={t("localeFilter")}
          value={localeFilter}
          onChange={(e) => setLocaleFilter(e.target.value as Locale | "")}
          options={[{ value: "", label: t("any") }, { value: "fa", label: "فارسی" }, { value: "en", label: "English" }]}
        />
        <Button variant="secondary" onClick={load}>
          {t("applyFilters")}
        </Button>
      </div>

      {!items ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : items.items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        items.items.map((article) => (
          <button key={article.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/content/${article.id}`)}>
            <ContextSurface className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {article.locales.map((l) => (
                  <StatusLabel key={l.locale} tone={articleStatusTone(l.status)}>
                    {`${l.locale.toUpperCase()}: ${t(`status.${l.status}`)}`}
                  </StatusLabel>
                ))}
              </div>
              <span className="text-body font-medium text-text-primary">{article.locales[0]?.title ?? t("untitled")}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-metadata text-text-secondary">
                {article.category ? <span>{article.category.name}</span> : null}
                {article.author ? <span>{article.author.name}</span> : null}
                <span>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(article.updatedAt))}</span>
              </div>
            </ContextSurface>
          </button>
        ))
      )}
    </div>
  );
}
