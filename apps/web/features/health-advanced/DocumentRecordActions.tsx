"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import type { MedicalDocumentDto } from "@petlife/types";
import { usePetAccess } from "@/hooks/use-pet-access";
import { healthAdvancedService } from "@/services/health-advanced.service";

/** Retraction is explicit and audited. Clinician documents receive correction requests. */
export function DocumentRecordActions({ petId, document, onSaved }: { petId: string; document: MedicalDocumentDto; onSaved: () => Promise<void> }) {
 const t = useTranslations("rollout.records"); const { access } = usePetAccess(petId);
 const [reason, setReason] = useState(""); const [busy,setBusy]=useState(false); const [failed,setFailed]=useState(false); const [saved,setSaved]=useState(false);
 if (!access?.canEditHealth || document.voidedAt) return null;
 const clinical = document.sourceType === "PROVIDER" || document.sourceType === "CLINIC";
 async function save(e: React.FormEvent) { e.preventDefault(); if (!reason.trim() || busy) return; setBusy(true);setFailed(false);setSaved(false); try { if (clinical) await healthAdvancedService.createCorrection(petId,{targetType:"MEDICAL_DOCUMENT",targetId:document.id,correctionText:reason.trim()}); else await healthAdvancedService.voidDocument(petId,document.id,reason.trim());setReason("");setSaved(true);await onSaved(); } catch {setFailed(true);} finally {setBusy(false);} }
 return <ContextSurface><form className="flex flex-col gap-4" onSubmit={save}><h2 className="text-section-title">{t(clinical ? "correction" : "retractDocument")}</h2><p>{t(clinical ? "providerLocked" : "retractHint")}</p><label className="flex flex-col gap-2">{t("reason")}<textarea rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} required className="rounded border border-border-subtle bg-surface-elevated p-3" /></label><Button type="submit" disabled={!reason.trim()} isLoading={busy}>{t(clinical ? "save" : "retractDocument")}</Button>{failed?<p role="alert">{t("failedSave")}</p>:null}{saved?<p role="status">{t(clinical ? "correctionSaved" : "saved")}</p>:null}</form></ContextSurface>;
}
