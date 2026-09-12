"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { PatientVitalsDto, VitalsTrendsDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { clinicalOwnerService } from "@/services/vet-panel.service";
import { VitalsSparkline } from "@/features/vet-panel/VitalsSparkline";

/**
 * The owner's view of measurements taken at the clinic (Handoff 24) — the
 * same rows the vet panel writes, read through the consumer API.
 *
 * There is deliberately no interpretation anywhere on this page: no
 * reference range, no "normal"/"high" badge, no trend arrow. A weight line is
 * drawn because weight over time is meaningful to an owner without a
 * clinician reading it; a temperature is shown as the number the clinic
 * recorded, and what it means is a conversation with their vet.
 */
export function HealthVitalsView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced.vitals");
  const tCommon = useTranslations("common");

  const [records, setRecords] = useState<PatientVitalsDto[] | null>(null);
  const [trends, setTrends] = useState<VitalsTrendsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [rows, trendRows] = await Promise.all([clinicalOwnerService.listVitals(petId), clinicalOwnerService.getVitalsTrends(petId)]);
      setRecords(rows);
      setTrends(trendRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error && !records) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!records || !trends) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <p className="text-metadata text-text-secondary">{t("disclaimer")}</p>

      {trends.weightKg.length > 1 ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("weightTrend")}</h2>
          <VitalsSparkline points={trends.weightKg} ariaLabel={t("weightTrend")} />
          <p className="text-metadata text-text-secondary">{t("trendCaption", { count: trends.weightKg.length })}</p>
        </ContextSurface>
      ) : null}

      {records.length === 0 ? (
        /* "No measurements recorded" — never a reassuring blank page. */
        <EmptyState title={t("empty")} description={t("emptyDescription")} />
      ) : (
        records.map((record) => (
          <ContextSurface key={record.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-body text-text-primary">{new Date(record.recordedAt).toLocaleString()}</span>
              <span className="text-metadata text-text-secondary">{record.source.providerOrganizationName ?? "—"}</span>
            </div>
            <span className="text-body text-text-secondary">
              {[
                record.weightValue !== null ? `${t("weight")}: ${record.weightValue} ${record.weightUnit ?? ""}` : null,
                record.temperatureC !== null ? `${t("temperature")}: ${record.temperatureC} °C` : null,
                record.heartRateBpm !== null ? `${t("heartRate")}: ${record.heartRateBpm}` : null,
                record.respiratoryRateBpm !== null ? `${t("respiratoryRate")}: ${record.respiratoryRateBpm}` : null,
                record.bodyConditionScore !== null ? `${t("bodyCondition")}: ${record.bodyConditionScore}${record.bodyConditionScale ? ` (${record.bodyConditionScale})` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || t("noneRecorded")}
            </span>
            {record.notes ? <span className="text-body text-text-secondary">{record.notes}</span> : null}
          </ContextSurface>
        ))
      )}
    </div>
  );
}
