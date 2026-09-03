"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { CategoryDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";

/** Flat category CRUD — both locales edited on one screen (see AdminCategoryService's own doc comment for why this differs from the article editor's per-locale-tab approach). */
export function AdminContentCategoriesView() {
  const t = useTranslations("admin.content.categories");
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [faName, setFaName] = useState("");
  const [faSlug, setFaSlug] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setCategories(await adminContentService.listCategories());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setCreateError(null);
    if (!faName || !faSlug) {
      setCreateError(t("faRequired"));
      return;
    }
    const locales = [{ locale: "fa" as const, name: faName, slug: faSlug }, ...(enName && enSlug ? [{ locale: "en" as const, name: enName, slug: enSlug }] : [])];
    try {
      await adminContentService.createCategory(locales);
      setFaName("");
      setFaSlug("");
      setEnName("");
      setEnSlug("");
      await load();
    } catch {
      setCreateError(t("createFailed"));
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("newCategory")}</span>
        <div className="flex flex-wrap gap-2">
          <Input label={t("faName")} value={faName} onChange={(e) => setFaName(e.target.value)} />
          <Input label={t("faSlug")} value={faSlug} onChange={(e) => setFaSlug(e.target.value)} />
          <Input label={t("enName")} value={enName} onChange={(e) => setEnName(e.target.value)} />
          <Input label={t("enSlug")} value={enSlug} onChange={(e) => setEnSlug(e.target.value)} />
        </div>
        {createError ? <span className="text-metadata text-state-urgent">{createError}</span> : null}
        <Button onClick={create}>{t("create")}</Button>
      </ContextSurface>

      {!categories ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : categories.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        categories.map((c) => (
          <ContextSurface key={c.id} className="flex flex-wrap gap-x-4 gap-y-1">
            {c.locales.map((l) => (
              <span key={l.locale} className="text-body text-text-primary">
                {l.locale.toUpperCase()}: {l.name} (/{l.slug})
              </span>
            ))}
          </ContextSurface>
        ))
      )}
    </div>
  );
}
