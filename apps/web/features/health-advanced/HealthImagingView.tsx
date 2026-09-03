"use client";

import { useTranslations } from "next-intl";
import type { ImagingStudyDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";

export function HealthImagingView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  return (
    <HealthRecordListView<ImagingStudyDto>
      petId={petId}
      title={t("imaging.title")}
      emptyTitle={t("imaging.empty")}
      fetcher={healthAdvancedService.listImaging}
      keyOf={(i) => i.id}
      renderItem={(study) => (
        <>
          <span className="text-body text-text-primary">{study.studyType}</span>
          {study.bodyRegion ? <span className="text-metadata text-text-secondary">{study.bodyRegion}</span> : null}
          {/* Free-text provider report only — never an automated diagnosis. */}
          {study.report ? <p className="text-body text-text-primary">{study.report}</p> : null}
          {study.source.providerOrganizationName ? <span className="text-metadata text-text-secondary">{study.source.providerOrganizationName}</span> : null}
        </>
      )}
    />
  );
}
