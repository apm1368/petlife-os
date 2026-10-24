"use client";
import {useEffect,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface} from "@petlife/ui";
import {clinicCustomerExtrasService,type SharedClinicNote} from "@/services/clinic-customer-extras.service";
export function MemberClinicNotesView(){
 const t=useTranslations("clinicCustomerExtras"),locale=useLocale();const [rows,setRows]=useState<SharedClinicNote[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{const c=new AbortController();setLoading(true);setFailed(false);clinicCustomerExtrasService.sharedNotes(c.signal).then(value=>{if(!c.signal.aborted)setRows(value)}).catch(()=>{if(!c.signal.aborted)setFailed(true)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[revision]);
 return <div className="space-y-5"><h1 className="text-page-title">{t("sharedNotesTitle")}</h1><p>{t("sharedNotesIntro")}</p><p>{t("notesLimit")}</p><Button variant="secondary" onClick={()=>setRevision(v=>v+1)} disabled={loading}>{t("refresh")}</Button>{failed?<div><p role="alert">{t("loadFailed")}</p><Button onClick={()=>setRevision(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:rows.length===0?<p>{t("emptyShared")}</p>:rows.map(note=><ContextSurface key={note.id} className="space-y-2"><h2 className="text-section-title">{note.clinic.name}</h2><p className="whitespace-pre-wrap break-words">{note.body}</p><time dateTime={note.createdAt}>{new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(note.createdAt))}</time></ContextSurface>)}</div>
}
