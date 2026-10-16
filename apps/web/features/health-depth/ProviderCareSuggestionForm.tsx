"use client";
import {useEffect,useRef,useState} from "react";
import {useTranslations} from "next-intl";
import {Button,ContextSurface,Input,Select} from "@petlife/ui";
import {LocalDateTimeField} from "@/features/shared/date-picker/LocalDateTimeField";
import {useProviderStore} from "@/stores/provider-store";
import {healthDepthService} from "@/services/health-depth.service";
const types=["VACCINATION","VET_VISIT","LAB_TEST","IMAGING","DENTAL","MEDICATION","MEDICATION_REFILL","DEWORMING","PARASITE_PREVENTION","FOLLOW_UP","WEIGHT_CHECK","DOCUMENT_EXPIRY","GROOMING","CUSTOM"] as const;
const recurrences=["ONCE","DAILY","WEEKLY","WEEKDAYS","MONTHLY","YEARLY","CUSTOM"] as const;
export function ProviderCareSuggestionForm({source,sourceId,completed}:{source:"booking"|"visit";sourceId:string;completed:boolean}){
 const organization=useProviderStore(s=>s.context?.active?.providerOrganizationId);
 return <ProviderCareSuggestionContent key={`${organization}-${source}-${sourceId}`} source={source} sourceId={sourceId} completed={completed}/>;
}
function ProviderCareSuggestionContent({source,sourceId,completed}:{source:"booking"|"visit";sourceId:string;completed:boolean}){
 const t=useTranslations("careSuggestions");const role=useProviderStore(s=>s.context?.active?.role);const allowed=completed&&(role==="OWNER"||role==="VET"||(source==="booking"&&role==="STAFF"));
 const [title,setTitle]=useState(""),[type,setType]=useState("FOLLOW_UP"),[dueAt,setDueAt]=useState(""),[recurrence,setRecurrence]=useState("ONCE"),[interval,setInterval]=useState("1"),[notes,setNotes]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[saved,setSaved]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function submit(){if(!allowed||busy||!confirmed||!title.trim()||!dueAt)return;setBusy(true);setFailed(false);setSaved(false);try{if(recurrence==="CUSTOM"&&(!Number.isInteger(Number(interval))||Number(interval)<1||Number(interval)>3650))throw new Error("invalid interval");const input={title:title.trim(),type,suggestedDueAt:new Date(dueAt).toISOString(),recurrence,...(recurrence==="CUSTOM"?{intervalDays:Number(interval)}:{}),...(notes.trim()?{notes:notes.trim()}:{})};if(source==="booking")await healthDepthService.suggestForBooking(sourceId,[input]);else await healthDepthService.suggestForVisit(sourceId,[input]);if(alive.current){setSaved(true);setTitle("");setNotes("");setDueAt("");setConfirmed(false)}}catch{if(alive.current)setFailed(true)}finally{if(alive.current)setBusy(false)}}
 if(!allowed)return null;
 return <ContextSurface><form className="space-y-3" onSubmit={e=>{e.preventDefault();void submit()}}><h2 className="text-section-title">{t("providerTitle")}</h2><p>{t("providerIntro")}</p>{failed&&<p role="alert">{t("providerFailed")}</p>}{saved&&<p role="status">{t("providerSaved")}</p>}
 <fieldset disabled={busy} className="space-y-3"><Input label={t("suggestionTitle")} maxLength={200} required value={title} onChange={e=>{setTitle(e.target.value);setConfirmed(false)}}/><Select label={t("suggestionType")} value={type} onChange={e=>{setType(e.target.value);setConfirmed(false)}} options={types.map(value=>({value,label:t(`types.${value}`)}))}/><LocalDateTimeField label={t("suggestionDate")} value={dueAt} onChange={value=>{setDueAt(value);setConfirmed(false)}}/><Select label={t("recurrence")} value={recurrence} onChange={e=>{setRecurrence(e.target.value);setConfirmed(false)}} options={recurrences.map(value=>({value,label:t(`recurrences.${value}`)}))}/>{recurrence==="CUSTOM"&&<Input label={t("interval")} type="number" min={1} max={3650} step={1} required value={interval} onChange={e=>{setInterval(e.target.value);setConfirmed(false)}}/>}<label className="block">{t("notes")}<textarea className="block w-full" maxLength={1000} value={notes} onChange={e=>{setNotes(e.target.value);setConfirmed(false)}}/></label><label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("providerConfirm")}</label></fieldset>
 <Button type="submit" disabled={busy||!confirmed||!title.trim()||!dueAt}>{t("providerSubmit")}</Button>
 </form></ContextSurface>
}
