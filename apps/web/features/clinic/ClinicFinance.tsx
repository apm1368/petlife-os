"use client";
import {useEffect,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface,Input} from "@petlife/ui";
import {useProviderStore} from "@/stores/provider-store";
import {clinicOutreachService,type ClinicFinanceReport} from "@/services/clinic-outreach.service";
import {formatCurrency} from "@/lib/currency/format-currency";

export function ClinicFinance(){
 const owner=useProviderStore(s=>s.context?.active?.role==="OWNER");
 return owner?<ClinicFinanceContent/>:null;
}
function ClinicFinanceContent(){
 const t=useTranslations("clinicFinance"),locale=useLocale() as "fa"|"en";
 const [from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10)),[to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
 const [window,setWindow]=useState(()=>({from:new Date(Date.now()-30*86400000).toISOString(),to:new Date().toISOString()}));
 const [data,setData]=useState<ClinicFinanceReport|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[invalid,setInvalid]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setFailed(false);setData(null);clinicOutreachService.finance(window.from,window.to,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[window,retry]);
 const n=(value:number)=>new Intl.NumberFormat(locale).format(value);
 const money=(value:string,currency:string)=>currency==="IRR"?formatCurrency(Number(value),locale):`${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Number(value))} ${currency}`;
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <div className="space-y-4"><h2 className="text-section-title">{t("title")}</h2><p>{t("intro")}</p><form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();const start=new Date(`${from}T00:00:00+03:30`),end=new Date(`${to}T00:00:00+03:30`);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>366*86400000){setInvalid(true);return}setInvalid(false);setWindow({from:start.toISOString(),to:end.toISOString()})}}><Input type="date" label={t("from")} required value={from} onChange={e=>setFrom(e.target.value)}/><Input type="date" label={t("to")} required value={to} onChange={e=>setTo(e.target.value)}/><Button type="submit">{t("apply")}</Button></form>
 {invalid&&<p role="alert">{t("invalid")}</p>}{failed?<div><p role="alert">{t("failed")}</p><Button onClick={()=>setRetry(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:data&&<>
 <p>{date(data.from)} — {date(data.to)}</p><div className="grid gap-3 md:grid-cols-3">{(["total","completed","cancelled","noShow","refunded"] as const).map(key=><ContextSurface key={key}><h3>{t(`counts.${key}`)}</h3><p className="text-section-title">{n(data.bookings[key])}</p></ContextSurface>)}</div>
 <div className="grid gap-3 md:grid-cols-2">{(["billedAmount","payAtClinic","collectedOnline","ledgerPosted"] as const).map(key=><ContextSurface key={key}><h3 className="font-medium">{t(`money.${key}`)}</h3><p className="text-text-secondary">{t(`hints.${key}`)}</p>{data[key].length===0?<p>{t("noMoney")}</p>:data[key].map(row=><p key={row.currency}><bdi>{money(row.amount,row.currency)}</bdi></p>)}</ContextSurface>)}</div>
 <ContextSurface className="space-y-3"><h3 className="text-section-title">{t("services")}</h3>{data.byService.length===0?<p>{t("empty")}</p>:data.byService.map(row=><article key={`${row.providerServiceId}-${row.currency}`} className="flex flex-wrap justify-between gap-2 border-t border-border-subtle py-2"><h4>{row.name??t("unnamed")}</h4><span>{t("visits",{count:n(row.count)})}</span><bdi>{money(row.amount,row.currency)}</bdi></article>)}</ContextSurface>
 </>}
 </div>
}
