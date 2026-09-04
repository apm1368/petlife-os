"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { HealthTimelineEntryDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { ApiError } from "@/lib/api/client";

/** Every entry always shows its provenance (spec: "provenance indicator") — never just a bare fact with no origin. */
export function HealthTimelineView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  const tCommon = useTranslations("common");

  const [entries, setEntries] = useState<HealthTimelineEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setEntries(await healthAdvancedService.getTimeline(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
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
                <span className="text-metadata text-text-secondary">{new Date(entry.occurredAt).toLocaleDateString()}</span>
                <StatusLabel tone="neutral">{entry.sourceType}</StatusLabel>
              </div>
              <p className="text-body text-text-primary">{entry.summary}</p>
              {entry.source.providerOrganizationName ? <p className="text-metadata text-text-secondary">{entry.source.providerOrganizationName}</p> : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
