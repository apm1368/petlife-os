"use client";

import Link from "next/link";
import { formatCount } from "@/lib/number/format-number";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { CarePlanDto, ClinicalProblemDto, EndOfLifeCarePlanDto, MedicalRecordCorrectionDto, PrescriptionDto, SeniorCareNoteDto } from "@petlife/types";
import { clinicalOwnerService } from "@/services/vet-panel.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { usePetAccess } from "@/hooks/use-pet-access";

const SENIOR_FIELDS = { mobilityNotes: "mobility", cognitionNotes: "cognition", medicationComplexityNotes: "medicationComplexity", qualityOfLifeNotes: "quality", monitoringFrequencyText: "monitoring" } as const;
const CARE_FIELDS = { palliativeCareNotes: "palliative", endOfLifePreferences: "preferences", aftercarePreferences: "aftercare" } as const;
type Data = { problems: ClinicalProblemDto[]; prescriptions: PrescriptionDto[]; plans: CarePlanDto[]; senior: SeniorCareNoteDto[]; preferences: EndOfLifeCarePlanDto | null; corrections: MedicalRecordCorrectionDto[] };

/** Owner-facing reads never call a provider endpoint. Planning does not change pet lifecycle. */
export function HealthRecordsView({ petId }: { petId: string }) {
  const t = useTranslations("rollout.records");
  const locale = useLocale() as "fa" | "en";
  const { access, error: accessError, retry: retryAccess } = usePetAccess(petId);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<"problems" | "prescriptions" | "carePlans" | "senior" | "planning" | "corrections">("problems");
  const [senior, setSenior] = useState<Record<keyof typeof SENIOR_FIELDS, string>>({ mobilityNotes: "", cognitionNotes: "", medicationComplexityNotes: "", qualityOfLifeNotes: "", monitoringFrequencyText: "" });
  const [preferences, setPreferences] = useState<Record<keyof typeof CARE_FIELDS, string>>({ palliativeCareNotes: "", endOfLifePreferences: "", aftercarePreferences: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false; setData(null); setFailed(false);
    if (access?.canViewHealth) void Promise.all([clinicalOwnerService.listProblems(petId), clinicalOwnerService.listPrescriptions(petId), healthAdvancedService.listCarePlans(petId), healthAdvancedService.listSeniorCare(petId), healthAdvancedService.getEndOfLife(petId), healthAdvancedService.listCorrections(petId)]).then(([problems, prescriptions, plans, notes, care, corrections]) => {
      if (cancelled) return;
      setData({ problems, prescriptions, plans, senior: notes, preferences: care, corrections });
      setPreferences({ palliativeCareNotes: care?.palliativeCareNotes ?? "", endOfLifePreferences: care?.endOfLifePreferences ?? "", aftercarePreferences: care?.aftercarePreferences ?? "" });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [petId, access?.canViewHealth, retry]);
  async function save(kind: "senior" | "planning") {
    if (!access?.canEditHealth) return;
    setBusy(true); setSaveError(false); setSaved(false);
    try {
      if (kind === "senior") {
        const value = await healthAdvancedService.addSeniorCareNote(petId, Object.fromEntries(Object.entries(senior).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])));
        setData((d) => d ? { ...d, senior: [value, ...d.senior] } : d);
        setSenior({ mobilityNotes: "", cognitionNotes: "", medicationComplexityNotes: "", qualityOfLifeNotes: "", monitoringFrequencyText: "" });
      } else {
        const value = await healthAdvancedService.upsertEndOfLife(petId, Object.fromEntries(Object.entries(preferences).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])));
        setData((d) => d ? { ...d, preferences: value } : d);
      }
      setSaved(true);
    } catch { setSaveError(true); } finally { setBusy(false); }
  }
  const reload = () => setRetry((n) => n + 1);
  if (accessError) return <ErrorRecovery title={t("failed")} message="" retryLabel={t("retry")} onRetry={retryAccess} />;
  if (access && !access.canViewHealth) return <EmptyState title={t("noAccess")} />;
  if (failed) return <ErrorRecovery title={t("failed")} message="" retryLabel={t("retry")} onRetry={reload} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("clinical")} />;
  const day = (d: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(d));
  const labels = (value: string) => t.has(`statusLabels.${value}`) ? t(`statusLabels.${value}`) : value;
  const field = (label: string, value: string, onChange: (v: string) => void, max = 2000) => <label key={label} className="flex flex-col gap-2"><span>{t(label)}</span><textarea rows={3} maxLength={max} className="w-full rounded border border-border-subtle bg-surface-elevated p-3" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
  return <div className="flex flex-col gap-6"><header><h1 className="text-page-title">{t("clinical")}</h1><p className="mt-3 text-metadata text-text-secondary">{t("sources")}</p></header>
    <nav className="flex flex-wrap gap-2" aria-label={t("clinical")}>{(["problems", "prescriptions", "carePlans", "senior", "planning", "corrections"] as const).map((key) => <Button variant={tab === key ? "primary" : "secondary"} key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setSaved(false); setSaveError(false); }}>{t(key)}</Button>)}</nav>
    {tab === "problems" ? data.problems.length ? data.problems.map((item) => <ContextSurface key={item.id}><h2 className="text-section-title">{item.name}</h2><p>{labels(item.status)}</p>{item.notes ? <p className="mt-2">{item.notes}</p> : null}<p className="mt-3 text-metadata text-text-secondary">{item.source.providerOrganizationName ?? t("recordedBy")}</p></ContextSurface>) : <EmptyState title={t("empty")} /> : null}
    {tab === "prescriptions" ? data.prescriptions.length ? data.prescriptions.map((item) => <ContextSurface key={item.id}><h2 className="text-section-title"><bdi dir="auto">{item.drugName}</bdi></h2><p>{labels(item.status)}</p><p className="mt-2"><bdi dir="auto">{[item.strength, item.doseAmount != null ? `${formatCount(item.doseAmount, locale)} ${item.doseUnit ?? ""}` : null, item.frequencyText].filter(Boolean).join(" · ")}</bdi></p>{item.medicationId ? <Link className="underline" href={`/${locale}/pets/${petId}/health/medications/${item.medicationId}`}>{t("medicationRecord")}</Link> : null}{item.instructionsForOwner ? <p className="mt-2">{item.instructionsForOwner}</p> : null}<p className="mt-3 text-metadata text-text-secondary">{item.source.providerOrganizationName ?? t("recordedBy")} · {day(item.prescribedAt)}</p></ContextSurface>) : <EmptyState title={t("empty")} /> : null}
    {tab === "carePlans" ? data.plans.length ? data.plans.map((plan) => <ContextSurface key={plan.id}><h2 className="text-section-title">{plan.title}</h2>{plan.notes ? <p>{plan.notes}</p> : null}<ul className="mt-4 flex flex-col gap-3">{plan.items.map((item) => <li key={item.id}><b>{item.title}</b><p>{item.detail}</p><small>{labels(item.status)}{item.dueAt ? ` · ${day(item.dueAt)}` : ""}</small></li>)}</ul></ContextSurface>) : <EmptyState title={t("empty")} /> : null}
    {tab === "senior" ? <>{access?.canEditHealth ? <ContextSurface className="flex flex-col gap-4">{Object.entries(SENIOR_FIELDS).map(([key, label]) => field(label, senior[key as keyof typeof senior], (v) => setSenior({ ...senior, [key]: v }), key === "monitoringFrequencyText" ? 500 : 2000))}<Button isLoading={busy} disabled={!Object.values(senior).some((v) => v.trim())} onClick={() => save("senior")}>{t("save")}</Button></ContextSurface> : null}{data.senior.map((item) => <ContextSurface key={item.id}><time>{day(item.createdAt)}</time>{Object.entries(SENIOR_FIELDS).map(([key, label]) => item[key as keyof typeof SENIOR_FIELDS] ? <p key={key} className="mt-3"><b>{t(label)}: </b>{item[key as keyof typeof SENIOR_FIELDS]}</p> : null)}</ContextSurface>)}{data.senior.length === 0 ? <EmptyState title={t("empty")} /> : null}</> : null}
    {tab === "planning" ? <ContextSurface className="flex flex-col gap-4"><p>{t("planningHint")}</p>{Object.entries(CARE_FIELDS).map(([key, label]) => access?.canEditHealth && (!data.preferences || data.preferences.sourceType === "OWNER" || data.preferences.sourceType === "HOUSEHOLD_MEMBER") ? field(label, preferences[key as keyof typeof preferences], (v) => setPreferences({ ...preferences, [key]: v })) : <p key={key}><b>{t(label)}: </b>{data.preferences?.[key as keyof typeof CARE_FIELDS] ?? t("empty")}</p>)}{access?.canEditHealth && (!data.preferences || data.preferences.sourceType === "OWNER" || data.preferences.sourceType === "HOUSEHOLD_MEMBER") ? <Button isLoading={busy} disabled={!Object.values(preferences).some((v) => v.trim())} onClick={() => save("planning")}>{t("save")}</Button> : null}</ContextSurface> : null}
    {tab === "corrections" ? data.corrections.length ? data.corrections.map((item) => <ContextSurface key={item.id}><p>{item.correctionText}</p><p className="mt-3 text-metadata">{labels(item.status)} · {day(item.createdAt)}</p>{item.resolvedNote ? <p>{item.resolvedNote}</p> : null}</ContextSurface>) : <EmptyState title={t("empty")} /> : null}
    {saveError ? <p role="alert">{t("failedSave")}</p> : null}{saved ? <p role="status">{t("saved")}</p> : null}
  </div>;
}
