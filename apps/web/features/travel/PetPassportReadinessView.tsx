"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetPassportReadinessDto } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { ApiError } from "@/lib/api/client";

/** Not a government passport object — an aggregation of existing pet identity/health data plus travel-specific gaps (spec). Never duplicates H17 health records; every field here is a live read. */
export function PetPassportReadinessView({ petId }: { petId: string }) {
  const t = useTranslations("travel");
  const tCommon = useTranslations("common");

  const [readiness, setReadiness] = useState<PetPassportReadinessDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setReadiness(await travelService.getPassportReadiness(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!readiness) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("passport.title", { name: readiness.petName })}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("passport.microchip")}</span>
          <span className="text-body text-text-secondary">{readiness.microchipNumber ?? t("passport.missing")}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("passport.vaccinationStatus")}</span>
          <StatusLabel tone={readiness.vaccinationStatus === "UP_TO_DATE" ? "success" : "attention"}>{t(`vaccinationStatus.${readiness.vaccinationStatus}`)}</StatusLabel>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("passport.healthDocumentsCount")}</span>
          <span className="text-body text-text-secondary">{readiness.healthDocumentsCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("passport.travelDocumentsCount")}</span>
          <span className="text-body text-text-secondary">{readiness.travelDocumentsCount}</span>
        </div>
      </ContextSurface>

      {readiness.missingItems.length > 0 ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("passport.missingItemsTitle")}</h2>
          {readiness.missingItems.map((item) => (
            <p key={item} className="text-body text-state-urgent">
              {t(`passport.missingItem.${item}`)}
            </p>
          ))}
        </ContextSurface>
      ) : null}
    </div>
  );
}
