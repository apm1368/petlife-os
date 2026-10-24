"use client";
import {useCallback,useEffect,useState} from "react";
import {useLocale} from "next-intl";
import {ContextSurface,ErrorRecovery,Skeleton} from "@petlife/ui";
import {apiFetch} from "@/lib/api/client";
import Link from "next/link";
type Observation={id:string;description:string;category:string;observedAt:string;sourceType:string};
export function ObservationDetailView({petId,observationId}:{petId:string;observationId:string}){
 const locale=useLocale(),fa=locale==="fa";const[item,setItem]=useState<Observation|null>(null),[error,setError]=useState(false);
 const load=useCallback(async()=>{setError(false);try{setItem(await apiFetch<Observation>(`/pets/${petId}/observations/${observationId}`));}catch{setError(true);}},[petId,observationId]);
 useEffect(()=>{void load();},[load]);
 if(error)return <ErrorRecovery title={fa?"مشاهده در دسترس نیست":"Observation unavailable"} message="" retryLabel={fa?"تلاش دوباره":"Retry"} onRetry={load}/>;
 if(!item)return <Skeleton className="h-64 w-full"/>;
 return <article className="flex flex-col gap-5"><Link href={`/${locale}/pets/${petId}/health/observations`}>{fa?"بازگشت به مشاهدات":"Back to observations"}</Link><h1 className="text-page-title">{fa?"مشاهده صاحب حیوان":"Owner observation"}</h1><p className="text-sm text-text-secondary">{fa?"گزارش صاحب حیوان؛ تشخیص دامپزشک محسوب نمی‌شود.":"Reported by the owner; this is not a veterinary diagnosis."}</p><time dateTime={item.observedAt}>{new Intl.DateTimeFormat(fa?"fa-IR-u-ca-persian":"en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Tehran"}).format(new Date(item.observedAt))}</time><ContextSurface><p className="whitespace-pre-wrap text-body leading-8">{item.description}</p></ContextSurface></article>;
}
