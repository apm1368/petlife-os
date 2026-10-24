"use client";
import {useEffect,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface} from "@petlife/ui";
import {accountService,type ConsentHistoryDto} from "@/services/account.service";
export function ConsentHistory(){
 const t=useTranslations("consentHistory"),locale=useLocale();const [open,setOpen]=useState(false),[data,setData]=useState<ConsentHistoryDto|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!open)return;const c=new AbortController();setLoading(true);setFailed(false);accountService.consentHistory(c.signal).then(value=>{if(!c.signal.aborted)setData(value)}).catch(()=>{if(!c.signal.aborted)setFailed(true)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[open,revision]);
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <ContextSurface className="space-y-3"><h2 className="text-section-title">{t("title")}</h2><p>{t("intro")}</p><Button variant="secondary" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{t(open?"close":"open")}</Button>{open&&(failed?<div><p role="alert">{t("loadFailed")}</p><Button onClick={()=>setRevision(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:data&&<><p>{t("currentVersion")}: <bdi dir="ltr">{data.currentVersion}</bdi></p>{data.items.length===0?<p>{t("empty")}</p>:<ol className="space-y-4">{data.items.map((row,index)=><li key={`${row.kind}-${row.version}-${row.acceptedAt}-${row.withdrawnAt}-${index}`}><h3 className="font-medium">{t(`kinds.${row.kind}`)}</h3><p>{t("version")}: <bdi dir="ltr">{row.version}</bdi></p>{row.acceptedAt&&<p>{t("accepted",{date:date(row.acceptedAt)})}</p>}{row.withdrawnAt&&<p>{t("withdrawn",{date:date(row.withdrawnAt)})}</p>}<p>{t.has(`sources.${row.source}`)?t(`sources.${row.source}`):t("otherSource")}</p></li>)}</ol>}<p>{t("limit")}</p></>)}</ContextSurface>
}
