"use client";

import { useTranslations } from "next-intl";
import { StatusLabel } from "@petlife/ui";
import type { RehabPlanDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthRehabView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<RehabPlanDto>
      petId={petId}
      title={t("rehab.title")}
      emptyTitle={t("rehab.empty")}
      fetcher={healthAdvancedService.listRehab}
      keyOf={(r) => r.id}
      renderItem={(plan) => (
        <>
          <div className="flex items-center justify-between">
            <span className="text-body text-text-primary">{plan.goal ?? plan.exercisesText}</span>
            <StatusLabel tone={plan.status === "ACTIVE" ? "attention" : "neutral"}>{plan.status}</StatusLabel>
          </div>
          <span className="text-metadata text-text-secondary">{t("rehab.sessionsLogged", { count: plan.sessions.length })}</span>
        </>
      )}
    />
  );
}
