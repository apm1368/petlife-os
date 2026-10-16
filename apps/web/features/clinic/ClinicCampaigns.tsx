"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { useProviderStore } from "@/stores/provider-store";
import { clinicOutreachService, type ClinicCampaignPreview, type ClinicCampaignSegment } from "@/services/clinic-outreach.service";

export function ClinicCampaigns({canSend}: {canSend: boolean}) {
  const t = useTranslations("clinicCampaigns"), locale = useLocale();
  const role = useProviderStore(s => s.context?.active?.role);
  const allowed = role === "OWNER" || role === "VET";
  const [segment, setSegment] = useState<ClinicCampaignSegment>("APPOINTMENTS_TOMORROW");
  const [title, setTitle] = useState(""), [note, setNote] = useState("");
  const [preview, setPreview] = useState<ClinicCampaignPreview|null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [result, setResult] = useState<{recipientCount:number;delivered:number}|null>(null);
  const alive = useRef(true);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  async function inspect() {
    if (!allowed || busy) return;
    setBusy(true); setError(false); setPreview(null); setConfirmed(false); setResult(null);
    try {const response = await clinicOutreachService.preview(segment); if (alive.current) setPreview(response);}
    catch {if (alive.current) setError(true);}
    finally {if (alive.current) setBusy(false);}
  }
  async function send() {
    if (!allowed || !canSend || busy || !preview || !confirmed || !title.trim() || preview.alreadySentToday || preview.recipientCount < 1 || preview.recipientCount > 5000) return;
    setBusy(true); setError(false);
    try {const response = await clinicOutreachService.send({segment, title: title.trim(), ...(note.trim()?{note:note.trim()}:{}), confirm: true, expectedCount: preview.recipientCount}); if (alive.current) {setResult(response); setPreview(null); setConfirmed(false);}}
    catch {if (alive.current) {setError(true); setPreview(null); setConfirmed(false);}}
    finally {if (alive.current) setBusy(false);}
  }
  if (!allowed) return null;
  return <ContextSurface className="space-y-4"><h2 className="text-section-title">{t("title")}</h2><p>{t("intro")}</p>
    {error && <p role="alert">{t("failed")}</p>}{result && <p role="status">{t("result",{count:n(result.recipientCount),delivered:n(result.delivered)})}</p>}
    <Select label={t("segment")} value={segment} disabled={busy} onChange={e=>{setSegment(e.target.value as ClinicCampaignSegment); setPreview(null); setConfirmed(false); setResult(null);}} options={(["APPOINTMENTS_TOMORROW","VACCINES_DUE","FOLLOW_UP_DUE"] as const).map(value=>({value,label:t(`segments.${value}`)}))}/>
    <Button disabled={busy} variant="secondary" onClick={()=>void inspect()}>{t("preview")}</Button>
    {preview && <section className="space-y-3"><p>{t("audience",{count:n(preview.recipientCount),excluded:n(preview.excludedCount)})}</p>
      {preview.exclusionReasons.map(reason=><p key={reason.reason}>{t(`reasons.${["DUPLICATE_PET","PET_INACTIVE","NO_RECIPIENT"].includes(reason.reason)?reason.reason:"OTHER"}`,{count:n(reason.count)})}</p>)}
      {preview.sample.length>0&&<><h3>{t("sample")}</h3><ul>{preview.sample.map((pet,index)=><li key={`${pet.petId}-${index}`}>{pet.petName} · {pet.detail}</li>)}</ul></>}
      {preview.alreadySentToday?<p>{t("alreadySent")}</p>:preview.recipientCount===0?<p>{t("empty")}</p>:!canSend?<p>{t("noSend")}</p>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();void send();}}>
        <Input label={t("messageTitle")} maxLength={120} required value={title} onChange={e=>{setTitle(e.target.value);setConfirmed(false);}}/>
        <label className="block">{t("note")}<textarea className="block w-full" maxLength={1000} value={note} onChange={e=>{setNote(e.target.value);setConfirmed(false);}}/></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("confirm",{count:n(preview.recipientCount)})}</label>
        <Button type="submit" disabled={busy||!confirmed||!title.trim()||preview.recipientCount>5000}>{t("send")}</Button>
      </form>}
    </section>}
  </ContextSurface>;
}
