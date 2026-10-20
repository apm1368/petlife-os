"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { ArticleLifecycleStatus } from "@petlife/types";
import type { AdminPermissionName, ContentVersionDetailDto, ContentVersionSummaryDto, Locale as ContentLocale } from "@petlife/types";
import { RichTextRenderer } from "./RichTextRenderer";
import { adminContentService } from "@/services/admin-content.service";
import { useAdminStore } from "@/stores/admin-store";

/** Version history for one (article, locale) — spec: "Admin should be able to inspect version history. Restore should create a NEW version." */
export function AdminContentVersionHistoryView({ articleId, locale }: { articleId: string; locale: ContentLocale }) {
  const t = useTranslations("admin.content.versions");
  const actions = useTranslations("rollout.records");
  const router = useRouter();
  const uiLocale = useLocale() as "fa" | "en";
  const context = useAdminStore((state) => state.context);
  const adminStatus = useAdminStore((state) => state.status);
  const canRead = adminStatus === "ready" && context?.isAdmin === true && context.permissions.includes("content.view");
  const permitted = (permission: AdminPermissionName) => canRead && context?.permissions.includes(permission) === true;
  const canAct = (permission: AdminPermissionName) => {
    const current = useAdminStore.getState();
    return current.status === "ready" && current.context?.isAdmin === true && current.context.permissions.includes("content.view") && current.context.permissions.includes(permission);
  };

  const [versions, setVersions] = useState<ContentVersionSummaryDto[] | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ArticleLifecycleStatus | null>(null);
  const [error, setError] = useState(false);
  const inspectionGeneration = useRef(Symbol());
  const [selected, setSelected] = useState<ContentVersionDetailDto | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    if (!canRead) return;
    setError(false);
    try {
      const [items, current] = await Promise.all([
        adminContentService.listVersions(articleId, locale),
        adminContentService.getArticleLocale(articleId, locale),
      ]);
      setVersions(items);
      setCurrentStatus(current.status);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    inspectionGeneration.current = Symbol();
    setSelected(null);
    void load();
    return () => { inspectionGeneration.current = Symbol(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, locale, canRead]);

  async function restore(versionId: string) {
    if (!canAct("content.edit") || (currentStatus === ArticleLifecycleStatus.VISIBLE && !canAct("content.publish"))) return;
    setRestoring(versionId);
    setActionError(false);
    try {
      await adminContentService.restoreVersion(versionId);
      router.push(`/${uiLocale}/admin/content/${articleId}`);
    } catch {
      setActionError(true);
    } finally {
      setRestoring(null);
    }
  }

  async function inspect(versionId: string) {
    const generation = Symbol();
    inspectionGeneration.current = generation;
    setInspecting(versionId); setSelected(null); setActionError(false);
    try { const version = await adminContentService.getVersion(versionId); if (generation === inspectionGeneration.current) setSelected(version); }
    catch { if (generation === inspectionGeneration.current) setActionError(true); }
    finally { if (generation === inspectionGeneration.current) setInspecting(null); }
  }

  if (adminStatus === "idle" || adminStatus === "loading") return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (!canRead) return <EmptyState title={actions("noAccess")} />;
  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!versions) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  if (versions.length === 0) return <EmptyState title={t("empty")} />;

  const canRestore = permitted("content.edit") && (currentStatus !== ArticleLifecycleStatus.VISIBLE || permitted("content.publish"));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {actionError && <p role="alert">{t("actionError")}</p>}
      {selected && <ContextSurface className="space-y-3"><h2 className="text-section-title">{selected.snapshot.title}</h2><p>{selected.snapshot.excerpt}</p><RichTextRenderer body={selected.snapshot.body}/><Button variant="secondary" onClick={() => setSelected(null)}>{t("closePreview")}</Button></ContextSurface>}
      {versions.map((v) => (
        <ContextSurface key={v.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-body font-medium text-text-primary">{t("version", { number: v.versionNumber })}</span>
            <span className="text-metadata text-text-secondary">
              {v.editorAdmin.displayName} · {new Intl.DateTimeFormat(uiLocale === "fa" ? "fa-IR" : "en-US").format(new Date(v.createdAt))}
            </span>
            {v.changeNote ? <span className="text-metadata text-text-secondary">{v.changeNote}</span> : null}
          </div>
          <Button size="sm" variant="secondary" disabled={inspecting !== null} onClick={() => void inspect(v.id)}>{t("inspect")}</Button>
          {canRestore ? <Button size="sm" variant="secondary" disabled={restoring === v.id} onClick={() => restore(v.id)}>
            {t("restore")}
          </Button> : null}
        </ContextSurface>
      ))}
    </div>
  );
}
