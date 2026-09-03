"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { ContentVersionSummaryDto, Locale as ContentLocale } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";

/** Version history for one (article, locale) — spec: "Admin should be able to inspect version history. Restore should create a NEW version." */
export function AdminContentVersionHistoryView({ articleId, locale }: { articleId: string; locale: ContentLocale }) {
  const t = useTranslations("admin.content.versions");
  const router = useRouter();
  const uiLocale = useLocale() as "fa" | "en";

  const [versions, setVersions] = useState<ContentVersionSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setVersions(await adminContentService.listVersions(articleId, locale));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, locale]);

  async function restore(versionId: string) {
    setRestoring(versionId);
    try {
      await adminContentService.restoreVersion(versionId);
      router.push(`/${uiLocale}/admin/content/${articleId}`);
    } finally {
      setRestoring(null);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!versions) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (versions.length === 0) return <EmptyState title={t("empty")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {versions.map((v) => (
        <ContextSurface key={v.id} className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-body font-medium text-text-primary">{t("version", { number: v.versionNumber })}</span>
            <span className="text-metadata text-text-secondary">
              {v.editorAdmin.displayName} · {new Intl.DateTimeFormat(uiLocale === "fa" ? "fa-IR" : "en-US").format(new Date(v.createdAt))}
            </span>
            {v.changeNote ? <span className="text-metadata text-text-secondary">{v.changeNote}</span> : null}
          </div>
          <Button size="sm" variant="secondary" disabled={restoring === v.id} onClick={() => restore(v.id)}>
            {t("restore")}
          </Button>
        </ContextSurface>
      ))}
    </div>
  );
}
