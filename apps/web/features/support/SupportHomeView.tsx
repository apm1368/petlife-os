"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { SupportCaseUserSummaryDto } from "@petlife/types";
import { supportService } from "@/services/support.service";
import { supportStatusTone } from "./support-status-tone";

/**
 * Support Home (spec: "Profile -> Support"). A plain new-ticket CTA plus a
 * short recent-tickets preview — the exhaustive list lives on My Tickets,
 * this page is just the entry point.
 */
export function SupportHomeView() {
  const t = useTranslations("support");
  const router = useRouter();
  const locale = useLocale();

  const [recent, setRecent] = useState<SupportCaseUserSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await supportService.list({ pageSize: 3 });
      setRecent(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("home.title")}</h1>
      <p className="text-body text-text-secondary">{t("home.subtitle")}</p>

      <Button onClick={() => router.push(`/${locale}/support/new`)}>{t("home.createCta")}</Button>

      <div className="flex items-center justify-between gap-3">
        <span className="text-section-title text-text-primary">{t("home.recentTitle")}</span>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/support/tickets`)}>
          {t("home.viewAll")}
        </Button>
      </div>

      {error ? <ErrorRecovery title={t("home.recentTitle")} message="" retryLabel={t("retry")} onRetry={load} /> : null}
      {!error && !recent ? <Skeleton className="h-24 w-full" aria-label={t("loading")} /> : null}
      {!error && recent && recent.length === 0 ? <p className="text-metadata text-text-secondary">{t("home.noRecent")}</p> : null}

      {recent?.map((c) => (
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
