"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, Input, Select } from "@petlife/ui";
import { AllergySeverity, ConditionStatus, MedicationStatus, type AllergyDto, type ConditionDto, type MedicationDto } from "@petlife/types";
import { usePetAccess } from "@/hooks/use-pet-access";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";

type Kind = "allergy" | "condition" | "medication";
/** Clinical provenance wins over edit permission: provider records take correction requests. */
export function BasicHealthRecordEditor({ petId, kind, record, onSaved, onDeleted }: { petId: string; kind: Kind; record: AllergyDto | ConditionDto | MedicationDto; onSaved: () => void; onDeleted: () => void }) {
  const t = useTranslations("rollout.records");
  const allergyT = useTranslations("health.allergies");
  const { access } = usePetAccess(petId);
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(record.name);
  const [text, setText] = useState(kind === "allergy" ? (record as AllergyDto).reaction ?? "" : kind === "condition" ? (record as ConditionDto).notes ?? "" : (record as MedicationDto).instructions ?? "");
  const [status, setStatus] = useState<string>(record.status);
  const [severity, setSeverity] = useState((record as AllergyDto).severity ?? AllergySeverity.UNKNOWN);
  const [correction, setCorrection] = useState("");
  const clinical = record.sourceType === "PROVIDER" || record.sourceType === "CLINIC";
  if (!access?.canEditHealth) return null;
  async function save() {
    setBusy(true); setFailed(false); setSaved(false);
    try {
      if (clinical) await healthAdvancedService.createCorrection(petId, { targetType: kind.toUpperCase(), targetId: record.id, correctionText: correction.trim() });
      else if (kind === "allergy") await healthService.updateAllergy(petId, record.id, { name: name.trim(), reaction: text.trim() || undefined, severity });
      else if (kind === "condition") await healthService.updateCondition(petId, record.id, { name: name.trim(), notes: text.trim() || undefined, status: status as ConditionStatus });
      else await healthService.updateMedication(petId, record.id, { name: name.trim(), instructions: text.trim() || undefined, status: status as MedicationStatus });
      setOpen(false); setSaved(true); onSaved();
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  async function deleteItem() {
    setBusy(true); setFailed(false);
    try { await healthService.deleteAllergy(petId, record.id); onDeleted(); }
    catch { setFailed(true); setRemove(false); } finally { setBusy(false); }
  }
  return <ContextSurface className="flex flex-col gap-4">
    {clinical ? <p>{t("providerLocked")}</p> : null}
    <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => { setOpen((v) => !v); setFailed(false); }}>{clinical ? t("correction") : t("edit")}</Button>{!clinical && kind === "allergy" ? <Button variant="ghost" onClick={() => setRemove(true)}>{t("remove")}</Button> : null}</div>
    {open ? <div className="flex flex-col gap-4">{clinical ? <label><span>{t("reason")}</span><textarea className="mt-2 w-full rounded border border-border-subtle bg-surface-elevated p-3" rows={4} maxLength={2000} value={correction} onChange={(e) => setCorrection(e.target.value)} /></label> : <><Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} /><Input label={kind === "allergy" ? t("reaction") : kind === "medication" ? t("instructions") : t("notes")} value={text} onChange={(e) => setText(e.target.value)} />{kind === "allergy" ? <Select label={t("severity")} value={severity} onChange={(e) => setSeverity(e.target.value as AllergySeverity)} options={Object.values(AllergySeverity).map((s) => ({ value: s, label: allergyT(`severity_${s}`) }))} /> : <Select label={t("status")} value={status} onChange={(e) => setStatus(e.target.value)} options={Object.values(kind === "condition" ? ConditionStatus : MedicationStatus).map((s) => ({ value: s, label: t(`statusLabels.${s}`) }))} />}</>}
      <Button isLoading={busy} disabled={clinical ? !correction.trim() : !name.trim()} onClick={save}>{t("save")}</Button>
    </div> : null}
    {failed ? <p role="alert">{t("failedSave")}</p> : null}{saved ? <p role="status">{clinical ? t("correctionSaved") : t("saved")}</p> : null}
    <Dialog open={remove} onClose={() => { if (!busy) setRemove(false); }} title={t("confirmRemove")}><div className="flex gap-3"><Button disabled={busy} variant="secondary" onClick={() => setRemove(false)}>{t("cancel")}</Button><Button isLoading={busy} onClick={deleteItem}>{t("remove")}</Button></div></Dialog>
  </ContextSurface>;
}
