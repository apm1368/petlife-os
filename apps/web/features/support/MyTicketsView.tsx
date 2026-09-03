"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SupportCaseUserSummaryDto } from "@petlife/types";
import { supportService } from "@/services/support.service";
import { supportStatusTone } from "./support-status-tone";

/** My Tickets — the full history of the requester's own SupportCases, open and closed alike (spec: "closed ticket history"). */
export function MyTicketsView() {
  const t = useTranslations("support");
  const router = useRouter();
  const locale = useLocale();

  const [cases, setCases] = useState<SupportCaseUserSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await supportService.list({ pageSize: 50 });
      setCases(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("tickets.title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!cases) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("tickets.title")}</h1>
        <Button size="sm" onClick={() => router.push(`/${locale}/support/new`)}>
          {t("home.createCta")}
        </Button>
      </div>

      {cases.length === 0 ? <EmptyState title={t("tickets.empty")} actionLabel={t("home.createCta")} onAction={() => router.push(`/${locale}/support/new`)} /> : null}

      {cases.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/support/tickets/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{c.caseNumber}</span>
              <span className="text-metadata text-text-secondary">{c.subject}</span>
            </div>
            <StatusLabel tone={supportStatusTone(c.status)}>{t(`status.${c.status}`)}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
