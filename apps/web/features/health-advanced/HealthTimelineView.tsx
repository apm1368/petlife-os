"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import type { HealthTimelineEntryDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { useStatusText } from "@/lib/status/use-status-text";

/** Canonical detail route per timeline record type; rehab sessions have no standalone detail page. */
const DETAIL_PATH: Record<string, string> = {
  VACCINATION: "vaccination",
  MEDICATION_STARTED: "medications/:id",
  MEDICATION_STOPPED: "medications/:id",
  CONDITION_RECORDED: "conditions/:id",
  ALLERGY_RECORDED: "allergies/:id",
  CLINICAL_VISIT: "visits/:id",
  LAB_RESULT: "labs/:id",
  IMAGING_STUDY: "imaging/:id",
  REFERRAL: "referrals/:id",
  DENTAL_RECORD: "dental/:id",
  NUTRITION_PLAN: "nutrition/clinical/:id",
  OBSERVATION: "observations/:id",
  DOCUMENT_UPLOADED: "documents/:id",
};

/** Every entry always shows its provenance (spec: "provenance indicator") — never just a bare fact with no origin. */
export function HealthTimelineView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const fmt = useInstantFormat();
  const t = useTranslations("healthAdvanced");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [entries, setEntries] = useState<HealthTimelineEntryDto[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setError(null);
    try {
      setEntries(await healthAdvancedService.getTimeline(petId));
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!entries) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("timeline.title")}</h1>
      {entries.length === 0 ? (
        <EmptyState title={t("timeline.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <ContextSurface key={`${entry.recordType}-${entry.recordId}-${index}`} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-metadata text-text-secondary">{fmt.date(entry.occurredAt)}</span>
                <StatusLabel tone="neutral">{statusText.label(entry.sourceType, "source")}</StatusLabel>
              </div>
              {DETAIL_PATH[entry.recordType] ? (
                <Link href={`/${locale}/pets/${petId}/health/${DETAIL_PATH[entry.recordType]!.replace(":id", entry.recordId)}`} className="text-body text-text-primary underline-offset-4 hover:underline">{entry.summary}</Link>
              ) : (
                <p className="text-body text-text-primary">{entry.summary}</p>
              )}
              {entry.source.providerOrganizationName ? <p className="text-metadata text-text-secondary">{entry.source.providerOrganizationName}</p> : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
