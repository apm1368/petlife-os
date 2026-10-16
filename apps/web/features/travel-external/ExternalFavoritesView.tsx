"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {Button} from "@petlife/ui";
import {useSessionStore} from "@/stores/session-store";
import {useSessionBootstrap} from "@/hooks/use-session-bootstrap";
import {travelExternalService,type ExternalStay} from "@/services/travel-external.service";
import {ExternalStayCard} from "./ExternalStayCard";
export function ExternalFavoritesView(){
 const t=useTranslations("externalTravel"),locale=useLocale();useSessionBootstrap();const session=useSessionStore(s=>s.status);
 const [rows,setRows]=useState<{savedAt:string;available:boolean;stay:ExternalStay}[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[busy,setBusy]=useState<string|null>(null),[saveFailed,setSaveFailed]=useState(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{setRows([]);if(session!=="authenticated")return;const controller=new AbortController();setLoading(true);setFailed(false);travelExternalService.favorites(controller.signal).then(value=>{if(!controller.signal.aborted)setRows(value)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[session,revision]);
 async function remove(id:string){if(session!=="authenticated"||busy)return;setBusy(id);setSaveFailed(false);try{const result=await travelExternalService.unfavorite(id);if(alive.current&&!result.saved)setRows(old=>old.filter(row=>row.stay.id!==id))}catch{if(alive.current)setSaveFailed(true)}finally{if(alive.current)setBusy(null)}}
 return <div className="space-y-5"><h1 className="text-page-title">{t("favorites")}</h1><Link className="underline" href={`/${locale}/travel/external`}>{t("allStays")}</Link>{session==="unauthenticated"?<Link className="underline" href={`/${locale}/welcome?returnTo=${encodeURIComponent(`/${locale}/travel/external/favorites`)}`}>{t("loginToSave")}</Link>:session!=="authenticated"?<p role="status">{t("loading")}</p>:<>{saveFailed&&<p role="alert">{t("saveFailed")}</p>}{failed?<div><p role="alert">{t("favoritesFailed")}</p><Button onClick={()=>setRevision(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:rows.length===0?<p>{t("emptyFavorites")}</p>:<div className="grid gap-4 md:grid-cols-2">{rows.map(row=><ExternalStayCard key={row.stay.id} stay={row.stay} available={row.available} saved onFavorite={()=>void remove(row.stay.id)} busy={busy!==null}/>)}</div>}</>}</div>
}
