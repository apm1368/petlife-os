"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";

const CARDS: { key: keyof AdminDashboardSummaryDto; href: string }[] = [
  { key: "openSupportCases", href: "/support" },
  { key: "openDisputes", href: "/disputes" },
  { key: "openTrustCases", href: "/trust" },
  { key: "pendingRefundApprovals", href: "/transactions" },
  { key: "openTasks", href: "/tasks" },
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
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CARDS.map((card) => (
          <button key={card.key} type="button" className="text-start" onClick={() => router.push(`/${locale}/admin${card.href}`)}>
            <ContextSurface className="flex flex-col gap-1 py-3">
              <span className="text-page-title text-text-primary">{summary[card.key]}</span>
              <span className="text-metadata text-text-secondary">{t(`cards.${card.key}`)}</span>
            </ContextSurface>
          </button>
        ))}
      </div>
    </div>
  );
}
