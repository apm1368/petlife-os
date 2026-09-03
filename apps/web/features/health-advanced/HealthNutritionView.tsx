"use client";

import { useTranslations } from "next-intl";
import type { ClinicalNutritionPlanDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthNutritionView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<ClinicalNutritionPlanDto>
      petId={petId}
      title={t("nutrition.title")}
      emptyTitle={t("nutrition.empty")}
      fetcher={healthAdvancedService.listNutrition}
      keyOf={(n) => n.id}
      renderItem={(plan) => (
        <>
          <span className="text-body text-text-primary">{plan.goal ?? plan.recommendedFoodText}</span>
          {plan.frequencyText ? <span className="text-metadata text-text-secondary">{plan.frequencyText}</span> : null}
          {plan.source.providerOrganizationName ? <span className="text-metadata text-text-secondary">{plan.source.providerOrganizationName}</span> : null}
        </>
      )}
    />
  );
}
