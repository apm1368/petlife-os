"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Select, StatusLabel } from "@petlife/ui";
import { PrescriptionRoute, WeightUnit } from "@petlife/types";
import type { ClinicalNoteTemplateDto, DischargeSummaryDto, PatientVitalsDto, PrescriptionDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { vetPanelService, type RecordVitalsInput } from "@/services/vet-panel.service";

const ROUTES: PrescriptionRoute[] = [
  PrescriptionRoute.ORAL,
  PrescriptionRoute.SUBCUTANEOUS,
  PrescriptionRoute.INTRAVENOUS,
  PrescriptionRoute.INTRAMUSCULAR,
  PrescriptionRoute.TOPICAL,
  PrescriptionRoute.OTIC,
  PrescriptionRoute.OPHTHALMIC,
  PrescriptionRoute.INHALED,
  PrescriptionRoute.RECTAL,
  PrescriptionRoute.INTRANASAL,
  PrescriptionRoute.OTHER,
];

/**
 * Everything a vet does *during* a consultation, alongside the note fields
 * ProviderClinicalVisitView already owns: apply a note template, record the
 * exam, prescribe, and write the discharge document.
 *
 * Two design decisions worth stating:
 *
 * 1. The template picker hands text to the parent's note fields and writes
 *    nothing itself. A template is the organisation's stationery, not
 *    clinical content — nothing enters the record until the vet saves notes
 *    they actually wrote.
 * 2. The dose helper is advisory and never authoritative. It multiplies a
 *    mg/kg figure by the weight the vet types and shows the result as a
 *    suggestion; the vet still enters the dose they are prescribing. No
 *    computed number is ever submitted on their behalf.
 */
export function VetVisitClinicalTools({
  petId,
  visitId,
  isVisitEditable,
  onApplyTemplate,
}: {
  petId: string;
  visitId: string;
  isVisitEditable: boolean;
  onApplyTemplate: (template: ClinicalNoteTemplateDto) => void;
}) {
  const t = useTranslations("vetPanel.visitTools");
  const tCommon = useTranslations("common");

  const [templates, setTemplates] = useState<ClinicalNoteTemplateDto[]>([]);
  const [vitals, setVitals] = useState<PatientVitalsDto[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionDto[]>([]);
  const [discharge, setDischarge] = useState<DischargeSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [openPanel, setOpenPanel] = useState<"none" | "vitals" | "prescription" | "discharge">("none");

  const [vitalsForm, setVitalsForm] = useState({ weightValue: "", temperatureC: "", heartRateBpm: "", respiratoryRateBpm: "", bodyConditionScore: "", painScore: "", notes: "" });
  const [rxForm, setRxForm] = useState({ drugName: "", strength: "", route: PrescriptionRoute.ORAL as PrescriptionRoute, doseAmount: "", doseUnit: "mg", frequencyText: "", durationDays: "", refillsAuthorized: "0", instructionsForOwner: "" });
  const [doseHelper, setDoseHelper] = useState({ mgPerKg: "", weightKg: "" });
  const [dischargeForm, setDischargeForm] = useState({ summaryText: "", homeCareInstructions: "", medicationsSummary: "", warningSignsText: "", followUpInstructions: "" });

  async function load() {
    setError(null);
    try {
      const [templateRows, vitalsRows, rxRows, dischargeRow] = await Promise.all([
        vetPanelService.listNoteTemplates(),
        vetPanelService.listVitals(petId, 5),
        vetPanelService.listPrescriptions(petId),
        vetPanelService.getDischargeSummary(petId, visitId),
      ]);
      setTemplates(templateRows);
      setVitals(vitalsRows);
      setPrescriptions(rxRows);
      setDischarge(dischargeRow);
      if (dischargeRow) {
        setDischargeForm({
          summaryText: dischargeRow.summaryText ?? "",
          homeCareInstructions: dischargeRow.homeCareInstructions ?? "",
          medicationsSummary: dischargeRow.medicationsSummary ?? "",
          warningSignsText: dischargeRow.warningSignsText ?? "",
          followUpInstructions: dischargeRow.followUpInstructions ?? "",
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, visitId]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsBusy(false);
    }
  }

  /** Only fields the vet actually filled are sent — an untouched input stays absent, never zero. */
  function buildVitalsInput(): RecordVitalsInput {
    const numeric = (raw: string): number | undefined => (raw.trim() === "" ? undefined : Number(raw));
    return {
      petId,
      clinicalVisitId: visitId,
      weightValue: numeric(vitalsForm.weightValue),
      weightUnit: vitalsForm.weightValue.trim() === "" ? undefined : WeightUnit.KG,
      temperatureC: numeric(vitalsForm.temperatureC),
      heartRateBpm: numeric(vitalsForm.heartRateBpm),
      respiratoryRateBpm: numeric(vitalsForm.respiratoryRateBpm),
      bodyConditionScore: numeric(vitalsForm.bodyConditionScore),
      // A bare number is not a clinical fact — the scale it was read on travels with it.
      bodyConditionScale: vitalsForm.bodyConditionScore.trim() === "" ? undefined : "Purina 1-9",
      painScore: numeric(vitalsForm.painScore),
      painScale: vitalsForm.painScore.trim() === "" ? undefined : "Glasgow CMPS-SF 0-4",
      notes: vitalsForm.notes.trim() || undefined,
    };
  }

  const suggestedDose =
    doseHelper.mgPerKg.trim() !== "" && doseHelper.weightKg.trim() !== "" && Number.isFinite(Number(doseHelper.mgPerKg)) && Number.isFinite(Number(doseHelper.weightKg))
      ? (Number(doseHelper.mgPerKg) * Number(doseHelper.weightKg)).toFixed(2)
      : null;

  const latestVitals = vitals[0] ?? null;
  const activePrescriptions = prescriptions.filter((p) => p.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-body text-state-attention">{error}</p> : null}

      {/* --- Note templates ------------------------------------------------ */}
      {isVisitEditable && templates.length > 0 ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("templates")}</h2>
          <p className="text-metadata text-text-secondary">{t("templatesExplainer")}</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <Button key={template.id} variant="secondary" onClick={() => onApplyTemplate(template)}>
                {template.name}
              </Button>
            ))}
          </div>
        </ContextSurface>
      ) : null}

      {/* --- Exam / vitals -------------------------------------------------- */}
      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-section-title text-text-primary">{t("exam")}</h2>
          {isVisitEditable ? (
            <Button variant="ghost" onClick={() => setOpenPanel((p) => (p === "vitals" ? "none" : "vitals"))}>
              {t("recordExam")}
            </Button>
          ) : null}
        </div>

        {latestVitals ? (
          <p className="text-body text-text-primary">
            {[
              latestVitals.weightValue !== null ? `${latestVitals.weightValue} ${latestVitals.weightUnit ?? ""}` : null,
              latestVitals.temperatureC !== null ? `${latestVitals.temperatureC} °C` : null,
              latestVitals.heartRateBpm !== null ? `HR ${latestVitals.heartRateBpm}` : null,
              latestVitals.respiratoryRateBpm !== null ? `RR ${latestVitals.respiratoryRateBpm}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || t("noneRecorded")}
          </p>
        ) : (
          /* Never "unremarkable" — an empty exam means nothing was measured. */
          <p className="text-body text-text-secondary">{t("noExamRecorded")}</p>
        )}

        {openPanel === "vitals" ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Input label={t("weightKg")} type="number" step="0.01" value={vitalsForm.weightValue} onChange={(e) => setVitalsForm((f) => ({ ...f, weightValue: e.target.value }))} />
              <Input label={t("temperatureC")} type="number" step="0.1" value={vitalsForm.temperatureC} onChange={(e) => setVitalsForm((f) => ({ ...f, temperatureC: e.target.value }))} />
              <Input label={t("heartRate")} type="number" value={vitalsForm.heartRateBpm} onChange={(e) => setVitalsForm((f) => ({ ...f, heartRateBpm: e.target.value }))} />
              <Input label={t("respiratoryRate")} type="number" value={vitalsForm.respiratoryRateBpm} onChange={(e) => setVitalsForm((f) => ({ ...f, respiratoryRateBpm: e.target.value }))} />
              <Input label={t("bodyConditionScore")} type="number" min={1} max={9} hint={t("bodyConditionHint")} value={vitalsForm.bodyConditionScore} onChange={(e) => setVitalsForm((f) => ({ ...f, bodyConditionScore: e.target.value }))} />
              <Input label={t("painScore")} type="number" min={0} max={4} hint={t("painScoreHint")} value={vitalsForm.painScore} onChange={(e) => setVitalsForm((f) => ({ ...f, painScore: e.target.value }))} />
            </div>
            <Input label={t("examNotes")} value={vitalsForm.notes} onChange={(e) => setVitalsForm((f) => ({ ...f, notes: e.target.value }))} />
            <p className="text-metadata text-text-secondary">{t("blankFieldsExplainer")}</p>
            <Button
              variant="primary"
              isLoading={isBusy}
              onClick={async () => {
                await run(() => vetPanelService.recordVitals(buildVitalsInput()));
                setVitalsForm({ weightValue: "", temperatureC: "", heartRateBpm: "", respiratoryRateBpm: "", bodyConditionScore: "", painScore: "", notes: "" });
                setOpenPanel("none");
              }}
            >
              {t("saveExam")}
            </Button>
          </div>
        ) : null}
      </ContextSurface>

      {/* --- Prescribing ---------------------------------------------------- */}
      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-section-title text-text-primary">{t("prescriptions")}</h2>
          {isVisitEditable ? (
            <Button variant="ghost" onClick={() => setOpenPanel((p) => (p === "prescription" ? "none" : "prescription"))}>
              {t("prescribe")}
            </Button>
          ) : null}
        </div>

        {activePrescriptions.length === 0 ? (
          <p className="text-body text-text-secondary">{t("noActivePrescriptions")}</p>
        ) : (
          activePrescriptions.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="text-body text-text-primary">
                {p.drugName}
                {p.strength ? ` ${p.strength}` : ""} · {p.frequencyText ?? "—"}
              </span>
              {p.isControlledSubstance ? <StatusLabel tone="attention">{t("controlled")}</StatusLabel> : null}
            </div>
          ))
        )}

        {openPanel === "prescription" ? (
          <div className="flex flex-col gap-2">
            <Input label={t("drugName")} value={rxForm.drugName} onChange={(e) => setRxForm((f) => ({ ...f, drugName: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input label={t("strength")} value={rxForm.strength} onChange={(e) => setRxForm((f) => ({ ...f, strength: e.target.value }))} />
              <Select label={t("routeLabel")} value={rxForm.route} onChange={(e) => setRxForm((f) => ({ ...f, route: e.target.value as PrescriptionRoute }))} options={ROUTES.map((r) => ({ value: r, label: t(`route.${r}`) }))} />
            </div>

            {/* Advisory only. The vet types the dose they are prescribing; this
                helper never fills the field or submits a computed value. */}
            <div className="rounded-md border border-dashed border-border-subtle p-3">
              <p className="text-metadata text-text-secondary">{t("doseHelperTitle")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input label={t("mgPerKg")} type="number" step="0.01" value={doseHelper.mgPerKg} onChange={(e) => setDoseHelper((d) => ({ ...d, mgPerKg: e.target.value }))} />
                <Input label={t("weightKg")} type="number" step="0.01" value={doseHelper.weightKg} onChange={(e) => setDoseHelper((d) => ({ ...d, weightKg: e.target.value }))} />
              </div>
              <p className="mt-2 text-body text-text-primary">{suggestedDose ? t("suggestedDose", { value: suggestedDose }) : t("doseHelperEmpty")}</p>
              <p className="mt-1 text-metadata text-text-secondary">{t("doseHelperDisclaimer")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input label={t("doseAmount")} type="number" step="0.001" value={rxForm.doseAmount} onChange={(e) => setRxForm((f) => ({ ...f, doseAmount: e.target.value }))} />
              <Input label={t("doseUnit")} value={rxForm.doseUnit} onChange={(e) => setRxForm((f) => ({ ...f, doseUnit: e.target.value }))} />
              <Input label={t("frequency")} value={rxForm.frequencyText} onChange={(e) => setRxForm((f) => ({ ...f, frequencyText: e.target.value }))} />
              <Input label={t("durationDays")} type="number" min={1} value={rxForm.durationDays} onChange={(e) => setRxForm((f) => ({ ...f, durationDays: e.target.value }))} />
              <Input label={t("refillsAuthorized")} type="number" min={0} max={24} value={rxForm.refillsAuthorized} onChange={(e) => setRxForm((f) => ({ ...f, refillsAuthorized: e.target.value }))} />
            </div>
            <Input label={t("ownerInstructions")} value={rxForm.instructionsForOwner} onChange={(e) => setRxForm((f) => ({ ...f, instructionsForOwner: e.target.value }))} />
            <p className="text-metadata text-text-secondary">{t("prescriptionExplainer")}</p>
            <Button
              variant="primary"
              isLoading={isBusy}
              disabled={!rxForm.drugName.trim()}
              onClick={async () => {
                await run(() =>
                  vetPanelService.createPrescription({
                    petId,
                    clinicalVisitId: visitId,
                    drugName: rxForm.drugName.trim(),
                    strength: rxForm.strength.trim() || undefined,
                    route: rxForm.route,
                    doseAmount: rxForm.doseAmount.trim() === "" ? undefined : Number(rxForm.doseAmount),
                    doseUnit: rxForm.doseUnit.trim() || undefined,
                    frequencyText: rxForm.frequencyText.trim() || undefined,
                    durationDays: rxForm.durationDays.trim() === "" ? undefined : Number(rxForm.durationDays),
                    refillsAuthorized: Number(rxForm.refillsAuthorized) || 0,
                    instructionsForOwner: rxForm.instructionsForOwner.trim() || undefined,
                  }),
                );
                setRxForm({ drugName: "", strength: "", route: PrescriptionRoute.ORAL, doseAmount: "", doseUnit: "mg", frequencyText: "", durationDays: "", refillsAuthorized: "0", instructionsForOwner: "" });
                setOpenPanel("none");
              }}
            >
              {t("savePrescription")}
            </Button>
          </div>
        ) : null}
      </ContextSurface>

      {/* --- Discharge summary ---------------------------------------------- */}
      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-section-title text-text-primary">{t("dischargeSummary")}</h2>
          {discharge ? <StatusLabel tone={discharge.status === "ISSUED" ? "success" : "attention"}>{t(`dischargeStatus.${discharge.status}`)}</StatusLabel> : null}
        </div>

        {discharge?.status === "ISSUED" ? (
          <div className="flex flex-col gap-1">
            {/* Immutable once the owner has it — the form is gone, not merely disabled. */}
            <p className="text-metadata text-text-secondary">{t("issuedNotice", { time: new Date(discharge.issuedAt!).toLocaleString() })}</p>
            <p className="text-body text-text-primary">{discharge.summaryText ?? t("noneRecorded")}</p>
            {discharge.homeCareInstructions ? <p className="text-body text-text-secondary">{discharge.homeCareInstructions}</p> : null}
            {discharge.warningSignsText ? <p className="text-body text-state-attention">{discharge.warningSignsText}</p> : null}
          </div>
        ) : (
          <>
            {!discharge ? <EmptyState title={t("noDischargeDraft")} /> : null}
            <Button variant="ghost" className="self-start" onClick={() => setOpenPanel((p) => (p === "discharge" ? "none" : "discharge"))}>
              {discharge ? t("editDischarge") : t("writeDischarge")}
            </Button>
            {openPanel === "discharge" ? (
              <div className="flex flex-col gap-2">
                <Input label={t("dischargeSummaryText")} value={dischargeForm.summaryText} onChange={(e) => setDischargeForm((f) => ({ ...f, summaryText: e.target.value }))} />
                <Input label={t("homeCare")} value={dischargeForm.homeCareInstructions} onChange={(e) => setDischargeForm((f) => ({ ...f, homeCareInstructions: e.target.value }))} />
                <Input label={t("medicationsSummary")} value={dischargeForm.medicationsSummary} onChange={(e) => setDischargeForm((f) => ({ ...f, medicationsSummary: e.target.value }))} />
                <Input label={t("warningSigns")} hint={t("warningSignsHint")} value={dischargeForm.warningSignsText} onChange={(e) => setDischargeForm((f) => ({ ...f, warningSignsText: e.target.value }))} />
                <Input label={t("followUpInstructions")} value={dischargeForm.followUpInstructions} onChange={(e) => setDischargeForm((f) => ({ ...f, followUpInstructions: e.target.value }))} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    isLoading={isBusy}
                    onClick={() =>
                      run(() =>
                        vetPanelService.saveDischargeSummary(petId, visitId, {
                          summaryText: dischargeForm.summaryText.trim() || undefined,
                          homeCareInstructions: dischargeForm.homeCareInstructions.trim() || undefined,
                          medicationsSummary: dischargeForm.medicationsSummary.trim() || undefined,
                          warningSignsText: dischargeForm.warningSignsText.trim() || undefined,
                          followUpInstructions: dischargeForm.followUpInstructions.trim() || undefined,
                        }),
                      )
                    }
                  >
                    {t("saveDraft")}
                  </Button>
                  {discharge ? (
                    <Button variant="primary" isLoading={isBusy} onClick={() => run(() => vetPanelService.issueDischargeSummary(petId, visitId))}>
                      {t("issueToOwner")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-metadata text-text-secondary">{t("issueExplainer")}</p>
              </div>
            ) : null}
          </>
        )}
      </ContextSurface>
    </div>
  );
}
