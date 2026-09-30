"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";

const CARDS: { key: "openSupportCases" | "openDisputes" | "openTrustCases" | "pendingRefundApprovals" | "openTasks" | "pendingProviderVerifications" | "contentDrafts"; href: string }[] = [
  { key: "openSupportCases", href: "/support" },
  { key: "openDisputes", href: "/disputes" },
  { key: "openTrustCases", href: "/trust" },
  { key: "pendingRefundApprovals", href: "/transactions" },
  { key: "openTasks", href: "/tasks" },
  { key: "pendingProviderVerifications", href: "/providers" },
  { key: "contentDrafts", href: "/content" },
];

export function AdminDashboardView() {
  const t = useTranslations("admin.dashboard");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();
  const [summary, setSummary] = useState<AdminDashboardSummaryDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setSummary(await adminService.getDashboard());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!summary) return <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <header><h1 className="text-page-title text-text-primary">{t("title")}</h1><p className="mt-1 text-body text-text-secondary">{locale === "fa" ? "نمای عملیاتی بر پایهٔ وضعیت‌های واقعی سامانه" : "Operational view based on real system state"}</p></header>
      <section className="space-y-3"><h2 className="text-section-title text-text-primary">{locale === "fa" ? "خلاصهٔ عملیاتی" : "Operational summary"}</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((card) => (
          <button key={card.key} type="button" className="text-start" onClick={() => router.push(`/${locale}/admin${card.href}`)}>
            <ContextSurface className="flex flex-col gap-1 py-3">
              <span className="text-page-title text-text-primary">{summary[card.key]}</span>
              <span className="text-metadata text-text-secondary">{t(`cards.${card.key}`)}</span>
            </ContextSurface>
          </button>
        ))}
      </div></section>
      <section className="grid gap-4 lg:grid-cols-2"><ContextSurface className="space-y-3"><h2 className="text-section-title text-text-primary">{locale === "fa" ? "نیازمند اقدام" : "Needs attention"}</h2>{summary.needsAttention.length ? summary.needsAttention.map((item) => <button key={item.id} type="button" className="flex w-full items-center justify-between border-b border-border-subtle py-2 text-start last:border-0" onClick={() => router.push(`/${locale}/admin${item.href}`)}><span className="text-body text-text-primary">{t(`cards.${item.id}` as never)}</span><StatusLabel tone={item.tone === "urgent" ? "urgent" : item.tone === "warning" ? "attention" : "neutral"}>{String(item.count)}</StatusLabel></button>) : <EmptyState title={locale === "fa" ? "موردی برای اقدام نیست" : "No items need action"} />}</ContextSurface><ContextSurface className="space-y-3"><h2 className="text-section-title text-text-primary">{locale === "fa" ? "فعالیت اخیر ادمین" : "Recent admin activity"}</h2>{summary.recentActivity.length ? summary.recentActivity.map((item) => <div key={item.id} className="border-b border-border-subtle py-2 last:border-0"><p className="text-body text-text-primary">{item.action} · {item.entityType}</p><p className="text-metadata text-text-secondary">{item.actorName} · {new Date(item.createdAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</p></div>) : <EmptyState title={locale === "fa" ? "فعالیتی ثبت نشده" : "No admin activity yet"} />}</ContextSurface></section>
    </div>
  );
}
