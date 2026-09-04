"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { LifeTimelineEntryDto } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";
import { ApiError } from "@/lib/api/client";

/** spec: "derived, never duplicated" — every row here is computed server-side from Memories/Health/lost-pet/lifecycle records, never a separately stored table. */
export function LifeTimelineView({ petId }: { petId: string }) {
  const t = useTranslations("memories");
  const tCommon = useTranslations("common");

  const [entries, setEntries] = useState<LifeTimelineEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setEntries(await memoriesService.getLifeTimeline(petId));
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
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("timeline.title")}</h1>

      {entries.length === 0 ? (
        <EmptyState title={t("timeline.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <ContextSurface key={`${entry.recordType}-${entry.recordId}-${index}`} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-metadata text-text-secondary">{t(`timelineEntryType.${entry.type}`)}</span>
                <span className="text-metadata text-text-secondary">{new Date(entry.occurredAt).toLocaleDateString()}</span>
              </div>
              <p className="text-body text-text-primary">{entry.summary}</p>
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
