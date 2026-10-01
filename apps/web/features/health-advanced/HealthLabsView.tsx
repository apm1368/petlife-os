"use client";

import { useLocale, useTranslations } from "next-intl";
import { localizeDigits } from "@/lib/date/jalali";
import { StatusLabel } from "@petlife/ui";
import type { LabResultDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordListView } from "./HealthRecordListView";
import { useStatusText } from "@/lib/status/use-status-text";

export function HealthLabsView({ petId }: { petId: string }) {
  const statusText = useStatusText();
  const t = useTranslations("healthAdvanced");
  const fa = useLocale() === "fa";
  const digits = (v: string | number) => localizeDigits(v, fa ? "fa" : "en");
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
            {lab.flag ? <StatusLabel tone={lab.flag === "ABNORMAL" ? "attention" : "success"}>{statusText.label(lab.flag, "labFlag")}</StatusLabel> : <StatusLabel tone="neutral">{statusText.label(lab.status, "lab")}</StatusLabel>}
          </div>
          {lab.value ? (
            <span className="text-metadata text-text-secondary">
              {/* Recorded value and the source's own range — digits in the UI language, order as a reader expects. */}
              <bdi>{digits(lab.value)}{lab.unit ? ` ${lab.unit}` : ""}</bdi>
              {lab.referenceRangeLow !== null && lab.referenceRangeHigh !== null ? <> · {fa ? "بازهٔ مرجع" : "Range"} <bdi>{digits(lab.referenceRangeLow)} {fa ? "تا" : "–"} {digits(lab.referenceRangeHigh)}</bdi></> : null}
            </span>
          ) : null}
          {lab.source.providerOrganizationName ? <span className="text-metadata text-text-secondary">{lab.source.providerOrganizationName}</span> : null}
        </>
      )}
    />
  );
}
