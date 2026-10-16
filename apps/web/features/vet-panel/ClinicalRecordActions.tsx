"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { ClinicalAlertSeverity, ClinicalAlertType, ClinicalProblemStatus, type ClinicalProblemDto } from "@petlife/types";
import { usePetAccess } from "@/hooks/use-pet-access";
import { providerClinicalService } from "@/services/provider-clinical.service";
import { vetPanelService } from "@/services/vet-panel.service";

/** Clinical writes are available only after the patient's explicit grant is loaded. */
export function ClinicalRecordActions({ petId, problems, onSaved }: { petId: string; problems: ClinicalProblemDto[]; onSaved: () => Promise<void> }) {
  const t = useTranslations("rollout.clinician");
  const { access } = usePetAccess(petId);
  const [kind, setKind] = useState<"problem" | "alert" | "template" | "referral" | "lab" | "estimate">("problem");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState(ClinicalAlertType.HANDLING);
  const [severity, setSeverity] = useState(ClinicalAlertSeverity.CAUTION);
  const [destination, setDestination] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!access?.canRecordClinicalData) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setFailed(false); setSaved(false);
    try {
      if (kind === "problem") await vetPanelService.createProblem({ petId, name: name.trim(), notes: notes.trim() || undefined });
      if (kind === "alert") await vetPanelService.createAlert({ petId, message: name.trim(), type, severity });
      if (kind === "template") await vetPanelService.createNoteTemplate({ name: name.trim(), historyTemplate: notes.trim() || undefined });
      if (kind === "referral") await providerClinicalService.createReferral({ petId, reason: name.trim(), externalProviderName: destination.trim() || undefined });
      if (kind === "lab") await providerClinicalService.createLabResult({ petId, testName: name.trim(), value: notes.trim() || undefined, unit: unit.trim() || undefined });
      if (kind === "estimate") {
        const minimum=Number(low), maximum=Number(high);
        if (!notes.trim() || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum<0 || maximum<minimum) { setFailed(true); return; }
        await vetPanelService.createEstimate({ petId, title:name.trim(), lines:[{description:notes.trim(),quantity:1,unitLowIrr:minimum,unitHighIrr:maximum}] });
      }
      setName(""); setNotes(""); setSaved(true); await onSaved();
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  return <ContextSurface><details><summary className="cursor-pointer font-bold">{t("title")}</summary><form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
    <Select label={t("kind")} value={kind} disabled={busy} onChange={(e) => { setKind(e.target.value as typeof kind); setName(""); setNotes(""); setFailed(false); setSaved(false); }} options={(["problem", "alert", "template", "referral", "lab", "estimate"] as const).map((value) => ({ value, label: t(value) }))} />
    <Input label={t(kind === "alert" ? "message" : "name")} required maxLength={kind === "alert" ? 1000 : 200} value={name} onChange={(e) => setName(e.target.value)} />
    {kind === "alert" ? <><Select label={t("alertType")} value={type} onChange={(e) => setType(e.target.value as ClinicalAlertType)} options={Object.values(ClinicalAlertType).map((value) => ({ value, label: t(`types.${value}`) }))} /><Select label={t("severity")} value={severity} onChange={(e) => setSeverity(e.target.value as ClinicalAlertSeverity)} options={Object.values(ClinicalAlertSeverity).map((value) => ({ value, label: t(`levels.${value}`) }))} /></> : kind === "referral" ? null : <label className="flex flex-col gap-2">{t(kind === "lab" ? "value" : kind === "estimate" ? "lineDescription" : "notes")}<textarea rows={4} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-border-subtle bg-surface-elevated p-3" /></label>}
    {kind === "referral" ? <Input label={t("destination")} value={destination} onChange={e=>setDestination(e.target.value)} /> : null}
    {kind === "lab" ? <Input label={t("unit")} value={unit} onChange={e=>setUnit(e.target.value)} /> : null}
    {kind === "estimate" ? <><p>{t("estimateHint")}</p><Input label={t("low")} type="number" min={0} step={1} value={low} onChange={e=>setLow(e.target.value)} required /><Input label={t("high")} type="number" min={Number(low) || 0} step={1} value={high} onChange={e=>setHigh(e.target.value)} required /></> : null}
    {failed ? <p role="alert">{t("failed")}</p> : null}{saved ? <p role="status">{t("saved")}</p> : null}<Button type="submit" isLoading={busy} disabled={!name.trim()}>{t("save")}</Button>
  </form>{problems.length ? <section className="mt-5 flex flex-col gap-4"><h3>{t("updateProblem")}</h3>{problems.map(problem => <ProblemStatus key={problem.id + problem.status} problem={problem} petId={petId} onSaved={onSaved} />)}</section> : null}</details></ContextSurface>;
}

function ProblemStatus({problem,petId,onSaved}:{problem:ClinicalProblemDto;petId:string;onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.records"); const [status,setStatus]=useState(problem.status); const [busy,setBusy]=useState(false); const [failed,setFailed]=useState(false);
 return <form className="flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setFailed(false);try{await vetPanelService.updateProblem(petId,problem.id,{status});await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}}><Select label={problem.name} value={status} onChange={e=>setStatus(e.target.value as ClinicalProblemStatus)} options={Object.values(ClinicalProblemStatus).map(value=>({value,label:t(`statusLabels.${value}`)}))}/><Button type="submit" isLoading={busy} disabled={status===problem.status}>{t("save")}</Button>{failed?<p role="alert">{t("failedSave")}</p>:null}</form>;
}
