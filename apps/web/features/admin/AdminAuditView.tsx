"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { AdminAuditLogDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function AdminAuditView() {
  const t = useTranslations("admin.audit");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale();

  const [logs, setLogs] = useState<AdminAuditLogDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listAudit({ pageSize: 50 });
      setLogs(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!logs) return <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {logs.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {logs.map((log) => (
        <ContextSurface key={log.id} className="flex flex-col gap-1 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body font-medium text-text-primary">{log.action}</span>
            <span className="text-metadata text-text-secondary">{formatDate(log.createdAt, locale)}</span>
          </div>
          <span className="text-metadata text-text-secondary">
            {t("entityType")}: {log.entityType} {log.entityId ? `(${log.entityId})` : ""} · {t("by", { name: log.adminUser.displayName })}
          </span>
          {log.reason ? <span className="text-metadata text-text-secondary">{t("reason")}: {log.reason}</span> : null}
        </ContextSurface>
      ))}
    </div>
  );
}
