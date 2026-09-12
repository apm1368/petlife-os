"use client";

import { useTranslations } from "next-intl";
import type { DischargeSummaryDto } from "@petlife/types";
import { clinicalOwnerService } from "@/services/vet-panel.service";
import { HealthRecordListView } from "./HealthRecordListView";

/**
 * The home-care instructions an owner actually acts on (Handoff 24). Only
 * ISSUED summaries ever reach this list — a clinic's draft is its own working
 * copy — and an issued one is immutable, so what the owner reads here cannot
 * change under them.
 *
 * Reuses HealthRecordListView, the same shell the six H17 record lists share.
 * The warning-signs section is rendered in the attention colour because it is
 * the part that has to be findable in a hurry.
 */
export function HealthDischargeSummariesView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced.discharge");

  return (
    <HealthRecordListView<DischargeSummaryDto>
      petId={petId}
      title={t("title")}
      emptyTitle={t("empty")}
      fetcher={clinicalOwnerService.listDischargeSummaries}
      keyOf={(item) => item.id}
      renderItem={(item) => (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-section-title text-text-primary">{item.providerOrganizationName}</span>
            <span className="text-metadata text-text-secondary">{item.issuedAt ? new Date(item.issuedAt).toLocaleString() : "—"}</span>
          </div>
          {item.summaryText ? <p className="text-body text-text-primary">{item.summaryText}</p> : null}
          {item.homeCareInstructions ? (
            <Section label={t("homeCare")} value={item.homeCareInstructions} />
          ) : null}
          {item.medicationsSummary ? <Section label={t("medications")} value={item.medicationsSummary} /> : null}
          {item.warningSignsText ? (
            <div className="flex flex-col">
              <span className="text-metadata text-text-secondary">{t("warningSigns")}</span>
              <span className="text-body text-state-attention">{item.warningSignsText}</span>
            </div>
          ) : null}
          {item.followUpAt || item.followUpInstructions ? (
            <Section label={t("followUp")} value={[item.followUpAt ? new Date(item.followUpAt).toLocaleDateString() : null, item.followUpInstructions].filter(Boolean).join(" — ")} />
          ) : null}
        </>
      )}
    />
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}
