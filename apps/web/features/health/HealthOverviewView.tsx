"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, ErrorRecovery, PriorityAction, Skeleton, StatusLabel } from "@petlife/ui";
import type { HealthSummaryDto } from "@petlife/types";
import { KnowledgeState } from "@petlife/types";
import { healthService } from "@/services/health.service";

const KNOWLEDGE_TONE: Record<KnowledgeState, "success" | "neutral" | "attention"> = {
  [KnowledgeState.KNOWN_PRESENT]: "neutral",
  [KnowledgeState.KNOWN_NEGATIVE]: "success",
  [KnowledgeState.UNKNOWN]: "attention",
  [KnowledgeState.INCOMPLETE]: "attention",
};

/**
 * Answers "what do we know right now?" — one hierarchy, not a grid of equal
 * metric cards: a single primary-attention block up top (mirroring Home's
 * ranking exactly, via the same HealthSummaryDto.primaryAttention), then a
 * secondary list of quick facts a reader can scan.
 */
export function HealthOverviewView({ petId }: { petId: string }) {
  const t = useTranslations("health");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [summary, setSummary] = useState<HealthSummaryDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setSummary(await healthService.getSummary(petId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!summary) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("overview.title")}</h1>

      {summary.primaryAttention ? (
        <ContextSurface>
          <PriorityAction
            title={t(summary.primaryAttention.titleKey.replace("health.", ""))}
            primaryLabel={tCommon("continue")}
            onPrimary={() => {
              if (summary.primaryAttention?.action === "VIEW_VACCINATION") router.push(`/${locale}/pets/${petId}/health/vaccination`);
              else router.push(`/${locale}/pets/${petId}/health/allergies`);
            }}
          />
        </ContextSurface>
      ) : (
        <ContextSurface>
          <p className="text-body text-text-primary">{t("setupStatus.COMPLETE")}</p>
        </ContextSurface>
      )}

      <ContextSurface className="flex flex-col gap-4">
        <Row
          label={t("overview.allergies")}
          value={<StatusLabel tone={KNOWLEDGE_TONE[summary.allergyState]}>{t(`knowledgeState.${summary.allergyState}`)}</StatusLabel>}
          onClick={() => router.push(`/${locale}/pets/${petId}/health/allergies`)}
        />
        <Row
          label={t("overview.conditions")}
          value={<StatusLabel tone={KNOWLEDGE_TONE[summary.conditionsState]}>{t(`knowledgeState.${summary.conditionsState}`)}</StatusLabel>}
          onClick={() => router.push(`/${locale}/pets/${petId}/health/conditions`)}
        />
        <Row
          label={t("overview.medications")}
          value={
            <StatusLabel tone={summary.activeMedicationCount > 0 ? "attention" : "neutral"}>
              {summary.activeMedicationCount > 0
                ? t("overview.activeMedications", { count: summary.activeMedicationCount })
                : t("overview.noActiveMedications")}
            </StatusLabel>
          }
          onClick={() => router.push(`/${locale}/pets/${petId}/health/medications`)}
        />
        <Row
          label={t("overview.vaccination")}
          value={
            <StatusLabel tone={summary.vaccinationStatus === "UP_TO_DATE" ? "success" : "attention"}>
              {t(`vaccinationStatus.${summary.vaccinationStatus}`)}
            </StatusLabel>
          }
          onClick={() => router.push(`/${locale}/pets/${petId}/health/vaccination`)}
        />
      </ContextSurface>
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between text-start">
      <span className="text-body text-text-primary">{label}</span>
      {value}
    </button>
  );
}
