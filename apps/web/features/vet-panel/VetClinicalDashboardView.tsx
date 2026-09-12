"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ClinicalDashboardDto, TriageLevel } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { vetPanelService } from "@/services/vet-panel.service";

/**
 * The clinical whiteboard — "who is in the building and what is overdue".
 *
 * Deliberately operational: no revenue, no per-vet productivity, no lifetime
 * counts, matching ProviderHomeView's own "no vanity analytics" bar. A board
 * that doubles as a performance dashboard changes how people record care.
 *
 * Every count here comes from the server's live read; nothing is recomputed
 * in the browser, so the board can never quietly disagree with the record.
 */
export const TRIAGE_TONE: Record<TriageLevel, "neutral" | "attention" | "urgent" | "emergency"> = {
  ROUTINE: "neutral",
  URGENT: "attention",
  EMERGENT: "urgent",
  CRITICAL: "emergency",
};

export function VetClinicalDashboardView() {
  const t = useTranslations("vetPanel.dashboard");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [dashboard, setDashboard] = useState<ClinicalDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setDashboard(await vetPanelService.getDashboard());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !dashboard) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!dashboard) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex flex-wrap gap-2">
        <StatusLabel tone="neutral">{t("todaysAppointments", { count: dashboard.todaysVetBookingCount })}</StatusLabel>
        <StatusLabel tone={dashboard.openVisits.length > 0 ? "attention" : "neutral"}>{t("openVisits", { count: dashboard.openVisits.length })}</StatusLabel>
        <StatusLabel tone={dashboard.overdueTreatmentTasks.length > 0 ? "urgent" : "success"}>{t("overdueTasks", { count: dashboard.overdueTreatmentTasks.length })}</StatusLabel>
        <StatusLabel tone={dashboard.unresolvedAlertCount > 0 ? "attention" : "neutral"}>{t("activeAlerts", { count: dashboard.unresolvedAlertCount })}</StatusLabel>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("whiteboard")}</h2>
        {dashboard.whiteboard.length === 0 ? (
          <EmptyState title={t("noInpatients")} />
        ) : (
          dashboard.whiteboard.map((row) => (
            <button
              key={row.hospitalization.id}
              type="button"
              onClick={() => router.push(`/${locale}/provider/hospitalizations/${row.hospitalization.id}?petId=${row.hospitalization.petId}`)}
              className="rounded-lg border border-border-subtle bg-surface-elevated p-4 text-start hover:bg-surface-subtle"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body text-text-primary">{row.hospitalization.petName}</span>
                {row.hospitalization.triageLevel ? (
                  <StatusLabel tone={TRIAGE_TONE[row.hospitalization.triageLevel]}>{t(`triage.${row.hospitalization.triageLevel}`)}</StatusLabel>
                ) : null}
              </div>
              <p className="mt-1 text-metadata text-text-secondary">{row.hospitalization.reasonForAdmission}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.hospitalization.kennelLabel ? <StatusLabel tone="neutral">{t("kennel", { label: row.hospitalization.kennelLabel })}</StatusLabel> : null}
                <StatusLabel tone={row.overdueTaskCount > 0 ? "urgent" : "neutral"}>{t("dueTasks", { count: row.dueTaskCount })}</StatusLabel>
                {/* An inpatient with no vitals yet reads as "not recorded", never as stable. */}
                <StatusLabel tone={row.latestVitalsAt ? "neutral" : "attention"}>
                  {row.latestVitalsAt ? t("lastVitals", { time: new Date(row.latestVitalsAt).toLocaleTimeString() }) : t("noVitalsYet")}
                </StatusLabel>
              </div>
            </button>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("overdueTasksHeading")}</h2>
        {dashboard.overdueTreatmentTasks.length === 0 ? (
          <EmptyState title={t("noOverdueTasks")} />
        ) : (
          dashboard.overdueTreatmentTasks.map((task) => (
            <ContextSurface key={task.id} className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-body text-text-primary">{task.title}</span>
                <span className="text-metadata text-text-secondary">{new Date(task.scheduledAt).toLocaleString()}</span>
              </div>
              <StatusLabel tone="urgent">{t("overdue")}</StatusLabel>
            </ContextSurface>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("awaitingOwnerDecision")}</h2>
        {dashboard.pendingEstimates.length === 0 ? (
          <EmptyState title={t("noPendingEstimates")} />
        ) : (
          dashboard.pendingEstimates.map((estimate) => (
            <ContextSurface key={estimate.id} className="flex items-center justify-between gap-2">
              <span className="text-body text-text-primary">{estimate.title}</span>
              <span className="text-metadata text-text-secondary">{t("estimateRange", { low: estimate.lowTotalIrr.toLocaleString(), high: estimate.highTotalIrr.toLocaleString() })}</span>
            </ContextSurface>
          ))
        )}
      </section>

      {dashboard.openVisits.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("openVisitsHeading")}</h2>
          {dashboard.openVisits.map((visit) => (
            <button
              key={visit.id}
              type="button"
              onClick={() => router.push(`/${locale}/provider/visits/${visit.id}?petId=${visit.petId}`)}
              className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-elevated p-3 text-start hover:bg-surface-subtle"
            >
              <span className="text-body text-text-primary">{visit.reasonForVisit ?? new Date(visit.startedAt).toLocaleString()}</span>
              <StatusLabel tone="attention">{t("inProgress")}</StatusLabel>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}
