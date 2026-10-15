"use client";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {ContextSurface} from "@petlife/ui";
import type {ExternalSourceRun} from "@/services/admin-travel-external.service";
export function ExternalRunSummary({run,detail=false}:{run:ExternalSourceRun;detail?:boolean}){
 const t=useTranslations("externalSourceAdmin"),locale=useLocale();const n=(value:number)=>new Intl.NumberFormat(locale).format(value);const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <ContextSurface className="space-y-3"><h3 className="font-medium">{t(`kinds.${run.kind}`)} · {t(`runStatuses.${run.status}`)}</h3>{run.source&&<p><bdi>{run.source.code}</bdi></p>}<time dateTime={run.startedAt}>{date(run.startedAt)}</time>{run.finishedAt&&<p>{t("finished",{date:date(run.finishedAt)})}</p>}<dl className="grid grid-cols-2 gap-3">{(["itemsScanned","listingsDiscovered","created","updated","unchanged","failed","removed"] as const).map(key=><div key={key}><dt>{t(`runCounts.${key}`)}</dt><dd>{n(run[key])}</dd></div>)}</dl>{run.anomaly&&<p>{t("anomaly")}</p>}{detail&&Array.isArray(run.errors)&&run.errors.length>0&&<section className="space-y-3"><h4 className="font-medium">{t("errorsTitle")}</h4>{run.errors.map((error,index)=><div key={index}><p className="break-words">{error.message}</p><p><bdi dir="ltr">{error.category}</bdi></p>{error.externalId&&<p><bdi dir="ltr">{error.externalId}</bdi></p>}</div>)}</section>}{!detail&&<Link className="underline" href={`/${locale}/admin/travel/external/runs/${run.id}`}>{t("runDetails")}</Link>}</ContextSurface>
}
