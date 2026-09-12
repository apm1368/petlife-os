"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ClinicalEstimateDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { clinicalOwnerService } from "@/services/vet-panel.service";

const STATUS_TONE: Record<ClinicalEstimateDto["status"], "neutral" | "attention" | "success" | "urgent"> = {
  DRAFT: "neutral",
  PRESENTED: "attention",
  APPROVED: "success",
  DECLINED: "urgent",
  EXPIRED: "neutral",
};

/**
 * The owner's side of a treatment estimate (Handoff 24).
 *
 * Money is shown as the range the clinic actually quoted, never collapsed to
 * a single reassuring figure — an honest veterinary estimate is a range, and
 * flattening it would be the same false precision this codebase refuses in
 * clinical data. Amounts are integer IRR from the server; the Toman line is a
 * display-only transform (Handoff 06), computed here and never sent back.
 *
 * Approve/Decline appear only on a PRESENTED estimate, and only this screen
 * has them: the clinic has no route that can consent on the household's
 * behalf.
 */
export function HealthEstimatesView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced.estimates");
  const tCommon = useTranslations("common");

  const [estimates, setEstimates] = useState<ClinicalEstimateDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setEstimates(await clinicalOwnerService.listEstimates(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function respond(estimateId: string, approve: boolean): Promise<void> {
    setBusyId(estimateId);
    setError(null);
    try {
      if (approve) {
        await clinicalOwnerService.approveEstimate(petId, estimateId);
      } else {
        const reason = window.prompt(t("declinePrompt")) ?? undefined;
        await clinicalOwnerService.declineEstimate(petId, estimateId, reason || undefined);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setBusyId(null);
    }
  }

  if (error && !estimates) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!estimates) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {error ? <p className="text-body text-state-attention">{error}</p> : null}

      {estimates.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDescription")} />
      ) : (
        estimates.map((estimate) => (
          <ContextSurface key={estimate.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-section-title text-text-primary">{estimate.title}</span>
              <StatusLabel tone={STATUS_TONE[estimate.status]}>{t(`status.${estimate.status}`)}</StatusLabel>
            </div>
            <p className="text-metadata text-text-secondary">{estimate.source.providerOrganizationName ?? "—"}</p>

            <div className="flex flex-col">
              <span className="text-body text-text-primary">{t("range", { low: estimate.lowTotalIrr.toLocaleString(), high: estimate.highTotalIrr.toLocaleString() })}</span>
              <span className="text-metadata text-text-secondary">{t("rangeToman", { low: Math.round(estimate.lowTotalIrr / 10).toLocaleString(), high: Math.round(estimate.highTotalIrr / 10).toLocaleString() })}</span>
              <span className="mt-1 text-metadata text-text-secondary">{t("rangeExplainer")}</span>
            </div>

            <ul className="flex flex-col gap-1">
              {estimate.lines.map((line) => (
                <li key={line.id} className="flex items-start justify-between gap-3">
                  <span className="text-body text-text-primary">
                    {line.description}
                    {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
                  </span>
                  <span className="shrink-0 text-metadata text-text-secondary">
                    {t("lineRange", { low: (line.unitLowIrr * line.quantity).toLocaleString(), high: (line.unitHighIrr * line.quantity).toLocaleString() })}
                  </span>
                </li>
              ))}
            </ul>

            {estimate.notes ? <p className="text-body text-text-secondary">{estimate.notes}</p> : null}
            {estimate.validUntil ? <p className="text-metadata text-text-secondary">{t("validUntil", { date: new Date(estimate.validUntil).toLocaleDateString() })}</p> : null}
            {estimate.declineReason ? <p className="text-metadata text-text-secondary">{t("declinedBecause", { reason: estimate.declineReason })}</p> : null}

            {estimate.status === "PRESENTED" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" isLoading={busyId === estimate.id} onClick={() => respond(estimate.id, true)}>
                  {t("approve")}
                </Button>
                <Button variant="secondary" isLoading={busyId === estimate.id} onClick={() => respond(estimate.id, false)}>
                  {t("decline")}
                </Button>
              </div>
            ) : null}
          </ContextSurface>
        ))
      )}
    </div>
  );
}
