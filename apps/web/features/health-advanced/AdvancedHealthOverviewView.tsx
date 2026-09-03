"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { HealthOverviewDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { ApiError } from "@/lib/api/client";

const NAV_ITEMS = ["timeline", "documents", "labs", "imaging", "referrals", "dental", "nutrition", "rehab", "observations"] as const;

/**
 * Answers "what matters for this pet right now" (spec) — no numeric health
 * score anywhere on this page (spec: "if a score cannot be responsibly
 * calculated, do not show one"). Missing information is named explicitly
 * rather than defaulting to a reassuring blank state.
 */
export function AdvancedHealthOverviewView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [overview, setOverview] = useState<HealthOverviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setOverview(await healthAdvancedService.getOverview(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!overview) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("overview.title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <Row label={t("overview.upcomingCare")} value={<StatusLabel tone="neutral">{`${overview.upcomingCare.length}`}</StatusLabel>} />
        <Row label={t("overview.overdueCare")} value={<StatusLabel tone={overview.overdueCare.length > 0 ? "attention" : "success"}>{`${overview.overdueCare.length}`}</StatusLabel>} />
        <Row label={t("overview.activeMedications")} value={<StatusLabel tone="neutral">{`${overview.activeMedicationsCount}`}</StatusLabel>} />
        <Row label={t("overview.unresolvedCarePlanItems")} value={<StatusLabel tone={overview.unresolvedCarePlanItemsCount > 0 ? "attention" : "success"}>{`${overview.unresolvedCarePlanItemsCount}`}</StatusLabel>} />
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("overview.missingInformation")}</h2>
        {overview.missingInformation.length === 0 ? (
          <p className="text-body text-text-secondary">{t("overview.noMissingInformation")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {overview.missingInformation.map((item) => (
              <li key={item} className="text-body text-state-attention">
                {item}
              </li>
            ))}
          </ul>
        )}
      </ContextSurface>

      <div className="grid grid-cols-2 gap-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => router.push(`/${locale}/pets/${petId}/health/advanced/${item}`)}
            className="rounded-lg border border-border-subtle bg-surface-elevated p-4 text-start text-body text-text-primary hover:bg-surface-subtle"
          >
            {t(`nav.${item}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body text-text-primary">{label}</span>
      {value}
    </div>
  );
}
