"use client";

import { useTranslations } from "next-intl";
import { StatusLabel } from "@petlife/ui";
import type { LabResultDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthLabsView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<LabResultDto>
      petId={petId}
      title={t("labs.title")}
      emptyTitle={t("labs.empty")}
      fetcher={healthAdvancedService.listLabs}
      keyOf={(l) => l.id}
      renderItem={(lab) => (
        <>
          <div className="flex items-center justify-between">
            <span className="text-body text-text-primary">{lab.testName}</span>
            {/* Never inferred — only ever shown when the provider explicitly set it. */}
            {lab.flag ? <StatusLabel tone={lab.flag === "ABNORMAL" ? "attention" : "success"}>{lab.flag}</StatusLabel> : <StatusLabel tone="neutral">{lab.status}</StatusLabel>}
          </div>
          {lab.value ? (
            <span className="text-metadata text-text-secondary">
              {lab.value} {lab.unit}
            </span>
          ) : null}
          {lab.source.providerOrganizationName ? <span className="text-metadata text-text-secondary">{lab.source.providerOrganizationName}</span> : null}
        </>
      )}
    />
  );
}
