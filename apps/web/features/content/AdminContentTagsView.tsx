"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { TagDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";

export function AdminContentTagsView() {
  const t = useTranslations("admin.content.tags");
  const [tags, setTags] = useState<TagDto[] | null>(null);
  const [error, setError] = useState(false);
  const [faName, setFaName] = useState("");
  const [faSlug, setFaSlug] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setTags(await adminContentService.listTags());
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
      await adminContentService.createTag(locales);
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
        <span className="text-section-title text-text-primary">{t("newTag")}</span>
        <div className="flex flex-wrap gap-2">
          <Input label={t("faName")} value={faName} onChange={(e) => setFaName(e.target.value)} />
          <Input label={t("faSlug")} value={faSlug} onChange={(e) => setFaSlug(e.target.value)} />
          <Input label={t("enName")} value={enName} onChange={(e) => setEnName(e.target.value)} />
          <Input label={t("enSlug")} value={enSlug} onChange={(e) => setEnSlug(e.target.value)} />
        </div>
        {createError ? <span className="text-metadata text-state-urgent">{createError}</span> : null}
        <Button onClick={create}>{t("create")}</Button>
      </ContextSurface>

      {!tags ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : tags.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        tags.map((tg) => (
          <ContextSurface key={tg.id} className="flex flex-wrap gap-x-4 gap-y-1">
            {tg.locales.map((l) => (
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
