"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ClinicalAlertSeverity, ProviderPatientRecordDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { vetPanelService } from "@/services/vet-panel.service";
import { providerClinicalService } from "@/services/provider-clinical.service";
import { VitalsSparkline } from "./VitalsSparkline";

type Tab = "summary" | "problems" | "vitals" | "prescriptions" | "visits" | "financial";

const ALERT_TONE: Record<ClinicalAlertSeverity, "neutral" | "attention" | "emergency"> = {
  INFO: "neutral",
  CAUTION: "attention",
  CRITICAL: "emergency",
};

/** A dash means "not recorded" everywhere in this view — never an implied normal or negative finding. */
function orDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/**
 * The consulting-room screen: one read that answers everything before the
 * clinician touches the animal.
 *
 * The layout is ordered by clinical risk rather than by data model — staff
 * safety alerts first, then allergies, then the live problem list, then
 * everything else behind tabs. Nothing on this page is derived: no health
 * score, no "stable" badge, no interpretation of a vital against a reference
 * range. Where a value was never recorded the page says so with a dash.
 */
export function VetPatientRecordView({ petId }: { petId: string }) {
  const t = useTranslations("vetPanel.record");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [record, setRecord] = useState<ProviderPatientRecordDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [isBusy, setIsBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      setRecord(await vetPanelService.getPatientRecord(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  const weightSeries = useMemo(
    () =>
      record
        ? [...record.vitalsHistory]
            .reverse()
            .filter((v) => v.weightValue !== null)
            .map((v) => ({ recordedAt: v.recordedAt, value: v.weightUnit === "LB" ? v.weightValue! * 0.45359237 : v.weightValue! }))
        : [],
    [record],
  );

  async function handleStartVisit(): Promise<void> {
    setIsBusy(true);
    setError(null);
    try {
      const visit = await providerClinicalService.startVisit({ petId });
      router.push(`/${locale}/provider/visits/${visit.id}?petId=${petId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsBusy(false);
    }
  }

  async function handleAdmit(): Promise<void> {
    const reason = window.prompt(t("admitPrompt"));
    if (!reason?.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      const admission = await vetPanelService.admitPatient({ petId, reasonForAdmission: reason.trim() });
      router.push(`/${locale}/provider/hospitalizations/${admission.id}?petId=${petId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsBusy(false);
    }
  }

  if (error && !record) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!record) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const openHospitalization = record.hospitalizations.find((h) => h.status === "ADMITTED");
  const activeProblems = record.problems.filter((p) => p.status === "ACTIVE" || p.status === "CHRONIC");

  return (
    <div className="flex flex-col gap-4">
      {/* Safety first: a handling alert has to be readable before anything else on the page. */}
      {record.alerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {record.alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface-elevated p-3">
              <div className="flex flex-col">
                <StatusLabel tone={ALERT_TONE[alert.severity]}>{t(`alertType.${alert.type}`)}</StatusLabel>
                <span className="mt-1 text-body text-text-primary">{alert.message}</span>
              </div>
              <Button
                variant="ghost"
                onClick={async () => {
                  await vetPanelService.resolveAlert(petId, alert.id);
                  await load();
                }}
              >
                {t("resolveAlert")}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-page-title text-text-primary">{record.pet.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" isLoading={isBusy} onClick={handleStartVisit}>
              {t("startVisit")}
            </Button>
            {openHospitalization ? (
              <Button variant="secondary" onClick={() => router.push(`/${locale}/provider/hospitalizations/${openHospitalization.id}?petId=${petId}`)}>
                {t("openTreatmentSheet")}
              </Button>
            ) : (
              <Button variant="secondary" isLoading={isBusy} onClick={handleAdmit}>
                {t("admit")}
              </Button>
            )}
          </div>
        </div>
        <p className="text-metadata text-text-secondary">
          {[t(`species.${record.pet.species}`), record.pet.breed, record.pet.sex ? t(`sex.${record.pet.sex}`) : null, record.pet.microchipNumber ? t("chip", { chip: record.pet.microchipNumber }) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {record.owner ? <p className="text-metadata text-text-secondary">{t("owner", { name: record.owner.displayName ?? "—", phone: record.owner.phone ?? "—" })}</p> : null}
        {error ? <p className="text-body text-state-attention">{error}</p> : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle pb-2">
        {(["summary", "problems", "vitals", "prescriptions", "visits", "financial"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={"shrink-0 rounded-full px-3 py-1.5 text-metadata " + (tab === item ? "bg-surface-subtle text-text-primary" : "text-text-secondary")}
          >
            {t(`tab.${item}`)}
          </button>
        ))}
      </nav>

      {tab === "summary" ? (
        <div className="flex flex-col gap-3">
          <ContextSurface className="flex flex-col gap-2">
            <h2 className="text-section-title text-text-primary">{t("allergies")}</h2>
            {record.allergies.length === 0 ? (
              /* Not "no allergies" — an empty list means nothing was recorded. */
              <p className="text-body text-text-secondary">{t("noneRecorded")}</p>
            ) : (
              record.allergies.map((a) => (
                <p key={a.id} className="text-body text-text-primary">
                  {a.name}
                  {a.severity ? ` (${a.severity})` : ""}
                </p>
              ))
            )}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <h2 className="text-section-title text-text-primary">{t("activeProblems")}</h2>
            {activeProblems.length === 0 ? (
              <p className="text-body text-text-secondary">{t("noneRecorded")}</p>
            ) : (
              activeProblems.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-body text-text-primary">{p.name}</span>
                  <StatusLabel tone={p.status === "CHRONIC" ? "attention" : "neutral"}>{t(`problemStatus.${p.status}`)}</StatusLabel>
                </div>
              ))
            )}
          </ContextSurface>

          <ContextSurface className="flex flex-col gap-2">
            <h2 className="text-section-title text-text-primary">{t("latestVitals")}</h2>
            {record.latestVitals ? (
              <>
                <p className="text-metadata text-text-secondary">{new Date(record.latestVitals.recordedAt).toLocaleString()}</p>
                <dl className="grid grid-cols-2 gap-2">
                  <Measure label={t("weight")} value={record.latestVitals.weightValue !== null ? `${record.latestVitals.weightValue} ${record.latestVitals.weightUnit ?? ""}` : null} />
                  <Measure label={t("temperature")} value={record.latestVitals.temperatureC !== null ? `${record.latestVitals.temperatureC} °C` : null} />
                  <Measure label={t("heartRate")} value={record.latestVitals.heartRateBpm} />
                  <Measure label={t("respiratoryRate")} value={record.latestVitals.respiratoryRateBpm} />
                  <Measure
                    label={t("bodyCondition")}
                    value={record.latestVitals.bodyConditionScore !== null ? `${record.latestVitals.bodyConditionScore}${record.latestVitals.bodyConditionScale ? ` (${record.latestVitals.bodyConditionScale})` : ""}` : null}
                  />
                  <Measure label={t("painScore")} value={record.latestVitals.painScore !== null ? `${record.latestVitals.painScore}${record.latestVitals.painScale ? ` (${record.latestVitals.painScale})` : ""}` : null} />
                </dl>
              </>
            ) : (
              <p className="text-body text-text-secondary">{t("noVitalsRecorded")}</p>
            )}
          </ContextSurface>

          {record.careProfile ? (
            <ContextSurface className="flex flex-col gap-2">
              <h2 className="text-section-title text-text-primary">{t("careContext")}</h2>
              <p className="text-body text-text-primary">{orDash(record.careProfile.temperamentText)}</p>
              <p className="text-body text-text-secondary">{orDash(record.careProfile.handlingSensitivityText)}</p>
            </ContextSurface>
          ) : null}
        </div>
      ) : null}

      {tab === "problems" ? (
        <div className="flex flex-col gap-2">
          {record.problems.length === 0 ? (
            <EmptyState title={t("noProblems")} />
          ) : (
            record.problems.map((p) => (
              <ContextSurface key={p.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body text-text-primary">{p.name}</span>
                  <StatusLabel tone={p.status === "RESOLVED" ? "success" : p.status === "RULED_OUT" ? "neutral" : "attention"}>{t(`problemStatus.${p.status}`)}</StatusLabel>
                </div>
                <span className="text-metadata text-text-secondary">
                  {[p.bodySystem, p.onsetAt ? t("onset", { date: new Date(p.onsetAt).toLocaleDateString() }) : null, p.source.providerOrganizationName].filter(Boolean).join(" · ")}
                </span>
                {p.notes ? <p className="text-body text-text-secondary">{p.notes}</p> : null}
              </ContextSurface>
            ))
          )}
        </div>
      ) : null}

      {tab === "vitals" ? (
        <div className="flex flex-col gap-3">
          {weightSeries.length > 1 ? (
            <ContextSurface className="flex flex-col gap-2">
              <h2 className="text-section-title text-text-primary">{t("weightTrend")}</h2>
              <VitalsSparkline points={weightSeries} ariaLabel={t("weightTrend")} />
              <p className="text-metadata text-text-secondary">{t("trendCaption", { count: weightSeries.length })}</p>
            </ContextSurface>
          ) : null}
          {record.vitalsHistory.length === 0 ? (
            <EmptyState title={t("noVitalsRecorded")} />
          ) : (
            record.vitalsHistory.map((v) => (
              <ContextSurface key={v.id} className="flex flex-col gap-1">
                <span className="text-metadata text-text-secondary">{new Date(v.recordedAt).toLocaleString()}</span>
                <span className="text-body text-text-primary">
                  {[
                    v.weightValue !== null ? `${t("weight")}: ${v.weightValue} ${v.weightUnit ?? ""}` : null,
                    v.temperatureC !== null ? `${t("temperature")}: ${v.temperatureC} °C` : null,
                    v.heartRateBpm !== null ? `${t("heartRate")}: ${v.heartRateBpm}` : null,
                    v.respiratoryRateBpm !== null ? `${t("respiratoryRate")}: ${v.respiratoryRateBpm}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("noneRecorded")}
                </span>
                {v.notes ? <span className="text-body text-text-secondary">{v.notes}</span> : null}
              </ContextSurface>
            ))
          )}
        </div>
      ) : null}

      {tab === "prescriptions" ? (
        <div className="flex flex-col gap-2">
          {record.prescriptions.length === 0 ? (
            <EmptyState title={t("noPrescriptions")} />
          ) : (
            record.prescriptions.map((p) => (
              <ContextSurface key={p.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body text-text-primary">
                    {p.drugName}
                    {p.strength ? ` ${p.strength}` : ""}
                  </span>
                  <StatusLabel tone={p.status === "ACTIVE" ? "success" : p.status === "CANCELLED" ? "urgent" : "neutral"}>{t(`prescriptionStatus.${p.status}`)}</StatusLabel>
                </div>
                <span className="text-metadata text-text-secondary">
                  {[p.doseAmount !== null ? `${p.doseAmount} ${p.doseUnit ?? ""}` : null, p.frequencyText, t(`route.${p.route}`), t("refills", { used: p.refillsDispensed, authorized: p.refillsAuthorized })]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {p.isControlledSubstance ? <StatusLabel tone="attention">{t("controlledSubstance")}</StatusLabel> : null}
                {p.status === "ACTIVE" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {p.refillsDispensed < p.refillsAuthorized ? (
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          await vetPanelService.dispenseRefill(petId, p.id);
                          await load();
                        }}
                      >
                        {t("dispenseRefill")}
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      onClick={async () => {
                        const reason = window.prompt(t("cancelPrompt"));
                        if (!reason?.trim()) return;
                        await vetPanelService.cancelPrescription(petId, p.id, reason.trim());
                        await load();
                      }}
                    >
                      {t("cancelPrescription")}
                    </Button>
                  </div>
                ) : null}
              </ContextSurface>
            ))
          )}
        </div>
      ) : null}

      {tab === "visits" ? (
        <div className="flex flex-col gap-2">
          {record.recentVisits.length === 0 ? (
            <EmptyState title={t("noVisits")} />
          ) : (
            record.recentVisits.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => router.push(`/${locale}/provider/visits/${v.id}?petId=${petId}`)}
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-elevated p-3 text-start hover:bg-surface-subtle"
              >
                <div className="flex flex-col">
                  <span className="text-body text-text-primary">{v.reasonForVisit ?? new Date(v.startedAt).toLocaleDateString()}</span>
                  <span className="text-metadata text-text-secondary">{v.providerOrganizationName}</span>
                </div>
                <StatusLabel tone="neutral">{v.status}</StatusLabel>
              </button>
            ))
          )}
        </div>
      ) : null}

      {tab === "financial" ? (
        <div className="flex flex-col gap-2">
          {record.estimates.length === 0 ? (
            <EmptyState title={t("noEstimates")} />
          ) : (
            record.estimates.map((estimate) => (
              <ContextSurface key={estimate.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body text-text-primary">{estimate.title}</span>
                  <StatusLabel tone={estimate.status === "APPROVED" ? "success" : estimate.status === "DECLINED" ? "urgent" : "attention"}>{t(`estimateStatus.${estimate.status}`)}</StatusLabel>
                </div>
                <span className="text-metadata text-text-secondary">{t("estimateRange", { low: estimate.lowTotalIrr.toLocaleString(), high: estimate.highTotalIrr.toLocaleString() })}</span>
                {estimate.status === "DRAFT" ? (
                  <Button
                    className="mt-1 self-start"
                    variant="secondary"
                    onClick={async () => {
                      await vetPanelService.presentEstimate(petId, estimate.id);
                      await load();
                    }}
                  >
                    {t("presentEstimate")}
                  </Button>
                ) : null}
                {/* Approval is the owner's action; the panel never offers it. */}
                {estimate.status === "PRESENTED" ? <p className="text-metadata text-text-secondary">{t("awaitingOwner")}</p> : null}
              </ContextSurface>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Measure({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-metadata text-text-secondary">{label}</dt>
      <dd className="text-body text-text-primary">{orDash(value)}</dd>
    </div>
  );
}
