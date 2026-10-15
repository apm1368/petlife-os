"use client";
import {useEffect,useRef,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface,Dialog,Input,Select} from "@petlife/ui";
import {clinicRemindersService,type ClinicReminder,type ClinicReminderKind} from "@/services/clinic-reminders.service";

export function ClinicReminderComposer({pets,onCreated}:{pets:{id:string;name:string}[];onCreated:()=>void}){
 const t=useTranslations("clinicReminders");
 const [open,setOpen]=useState(false),[petId,setPetId]=useState(pets[0]?.id??""),[kind,setKind]=useState<ClinicReminderKind>("CHECKUP"),[title,setTitle]=useState(""),[note,setNote]=useState(""),[dueAt,setDueAt]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[result,setResult]=useState<ClinicReminder|null>(null);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function create(){if(!confirmed||busy||!title.trim()||!pets.some(p=>p.id===petId))return;setBusy(true);setFailed(false);setResult(null);try{const result=await clinicRemindersService.create({petId,kind,title:title.trim(),...(note.trim()?{note:note.trim()}:{}),...(dueAt?{dueAt:new Date(dueAt).toISOString()}:{})});if(alive.current){setResult(result);setTitle("");setNote("");setDueAt("");setConfirmed(false);onCreated()}}catch{if(alive.current)setFailed(true)}finally{if(alive.current)setBusy(false)}}
 return <section className="space-y-3"><Button variant="secondary" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{t("compose")}</Button>{open&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void create()}} onChange={()=>setConfirmed(false)}>
 {failed&&<p role="alert">{t("createFailed")}</p>}{result&&<p role="status">{t("created",{status:t(`statuses.${result.status}`)})}</p>}
 <Select label={t("pet")} value={petId} onChange={e=>setPetId(e.target.value)} options={pets.map(p=>({value:p.id,label:p.name}))}/>
 <Select label={t("kind")} value={kind} onChange={e=>setKind(e.target.value as ClinicReminderKind)} options={(["CHECKUP","VACCINATION","MEDICATION","FOLLOW_UP","MESSAGE"] as const).map(value=>({value,label:t(`kinds.${value}`)}))}/>
 <Input label={t("messageTitle")} maxLength={120} required value={title} onChange={e=>setTitle(e.target.value)}/>
 <label className="block">{t("note")}<textarea className="block w-full" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <Input type="datetime-local" label={t("dueAt")} value={dueAt} onChange={e=>setDueAt(e.target.value)}/><p>{t("dueHelp")}</p>
 <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>{e.stopPropagation();setConfirmed(e.target.checked)}}/>{t(dueAt?"confirmSchedule":"confirmNow")}</label>
 <Button type="submit" disabled={busy||!confirmed||!title.trim()||!petId}>{t(dueAt?"schedule":"sendNow")}</Button>
 </form>}</section>
}
export function ClinicReminders(){
 const t=useTranslations("clinicReminders"),locale=useLocale();
 const [page,setPage]=useState(1),[status,setStatus]=useState(""),[rows,setRows]=useState<ClinicReminder[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState<ClinicReminder|null>(null),[busy,setBusy]=useState(false),[saveFailed,setSaveFailed]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setFailed(false);clinicRemindersService.list(page,status,controller.signal).then(result=>{if(!controller.signal.aborted){setRows(result.items);setTotal(result.total)}}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[page,status,revision]);
 async function cancel(){if(!selected||busy)return;setBusy(true);setSaveFailed(false);try{await clinicRemindersService.cancel(selected.id);if(alive.current){setSelected(null);setRevision(v=>v+1)}}catch{if(alive.current)setSaveFailed(true)}finally{if(alive.current)setBusy(false)}}
 const n=(value:number)=>new Intl.NumberFormat(locale).format(value);
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <div className="space-y-4"><h2 className="text-section-title">{t("title")}</h2><p>{t("intro")}</p><Select label={t("filter")} value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}} options={[{value:"",label:t("all")},...(["SCHEDULED","SENT","CANCELLED","FAILED"] as const).map(value=>({value,label:t(`statuses.${value}`)}))]}/>
 {failed?<div><p role="alert">{t("loadFailed")}</p><Button onClick={()=>setRevision(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:<>{rows.length===0?<p>{t("empty")}</p>:rows.map(row=><ContextSurface key={row.id} className="space-y-2"><h3 className="font-medium">{row.title}</h3><p>{t(`kinds.${row.kind}`)} · {t(`statuses.${row.status}`)}</p>{row.note&&<p className="whitespace-pre-wrap break-words">{row.note}</p>}<time dateTime={row.dueAt}>{date(row.dueAt)}</time><p>{t("recipients",{count:n(row.recipientCount)})}</p>{row.status==="SCHEDULED"&&<Button variant="secondary" disabled={busy} onClick={()=>{setSelected(row);setSaveFailed(false)}}>{t("cancel")}</Button>}</ContextSurface>)}<div className="flex flex-wrap items-center gap-3"><Button disabled={page===1} onClick={()=>setPage(v=>v-1)}>{t("previous")}</Button><span>{n(page)}</span><Button disabled={page*20>=total} onClick={()=>setPage(v=>v+1)}>{t("next")}</Button></div></>}
 <Dialog open={selected!==null} title={t("confirmCancel")} onClose={()=>{if(!busy)setSelected(null)}}><p>{selected?.title}</p>{saveFailed&&<p role="alert">{t("cancelFailed")}</p>}<div className="mt-4 flex gap-3"><Button disabled={busy} onClick={()=>void cancel()}>{t("cancel")}</Button><Button variant="secondary" disabled={busy} onClick={()=>setSelected(null)}>{t("keep")}</Button></div></Dialog>
 </div>
}
