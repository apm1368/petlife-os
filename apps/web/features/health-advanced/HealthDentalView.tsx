"use client";

import { useTranslations } from "next-intl";
import type { DentalRecordDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthDentalView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<DentalRecordDto>
      petId={petId}
      title={t("dental.title")}
      emptyTitle={t("dental.empty")}
      fetcher={healthAdvancedService.listDental}
      keyOf={(d) => d.id}
      renderItem={(record) => (
        <>
          <span className="text-body text-text-primary">{record.recordType}</span>
          {record.findings ? <p className="text-body text-text-secondary">{record.findings}</p> : null}
          {record.source.providerOrganizationName ? <span className="text-metadata text-text-secondary">{record.source.providerOrganizationName}</span> : null}
        </>
      )}
    />
  );
}
